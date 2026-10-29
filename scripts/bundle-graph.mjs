import ts from 'typescript';
import { posix } from 'node:path';

export function collectRouteGraph(
  sources,
  entries,
  deferredRoutes = new Set(),
) {
  const seen = new Set();
  function visit(name) {
    if (seen.has(name)) return;
    const source = sources.get(name);
    if (source === undefined) throw Error(`Missing browser module: ${name}`);
    seen.add(name);
    const parsed = ts.createSourceFile(
      name,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    if (parsed.parseDiagnostics.length)
      throw Error(`Invalid browser module: ${name}`);
    function dependency(specifier) {
      if (!specifier || !ts.isStringLiteralLike(specifier))
        throw Error(`Unresolved browser import: ${name}`);
      const path = specifier.text;
      if (!path.startsWith('./') && !path.startsWith('../'))
        throw Error(`Unbundled browser import: ${name}`);
      const target = posix.normalize(posix.join(posix.dirname(name), path));
      if (target === '..' || target.startsWith('../'))
        throw Error(`Escaping browser import: ${name}`);
      return target;
    }
    function walk(node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      )
        visit(dependency(node.moduleSpecifier));
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const target = dependency(node.arguments[0]);
        // Only another known route may be deferred. Feature imports still count.
        if (!deferredRoutes.has(target)) visit(target);
      }
      ts.forEachChild(node, walk);
    }
    walk(parsed);
  }
  entries.forEach(visit);
  return seen;
}

export function routeEntries(route, routes, assets) {
  if (!routes.includes(route)) throw Error(`Unknown route: ${route}`);
  const parts = route.split('.');
  const ancestors = parts
    .map((_, index) => parts.slice(0, index + 1).join('.'))
    .filter((name) => routes.includes(name));
  return ancestors.map((name) => {
    const prefix = name.replaceAll('$', '_') + '-';
    const matches = assets.filter((asset) =>
      posix.basename(asset).startsWith(prefix),
    );
    if (matches.length !== 1)
      throw Error(`Missing or ambiguous route artifact: ${name}`);
    return matches[0];
  });
}
