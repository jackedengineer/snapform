import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, relative, basename } from 'node:path';
import { collectRouteGraph, routeEntries } from './bundle-graph.mjs';

async function filesIn(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? filesIn(join(path, entry.name))
          : join(path, entry.name),
      ),
    )
  ).flat();
}
const files = await filesIn('apps/web/dist/client');
const sizes = await Promise.all(
  files
    .filter((path) => /\.(js|css)$/.test(path))
    .map(async (path) => ({
      path,
      bytes: gzipSync(await readFile(path)).length,
    })),
);
let exceeded = false;
for (const [extension, limit] of [
  ['js', 230 * 1024],
  ['css', 20 * 1024],
]) {
  const total = sizes
    .filter(({ path }) => path.endsWith(`.${extension}`))
    .reduce((sum, { bytes }) => sum + bytes, 0);
  console.log(
    `${extension.toUpperCase()} gzip: ${(total / 1024).toFixed(2)} KiB / ${limit / 1024} KiB`,
  );
  if (total > limit) exceeded = true;
}
const sources = new Map(
  await Promise.all(
    files
      .filter((path) => path.endsWith('.js'))
      .map(async (path) => [
        relative('apps/web/dist/client', path),
        await readFile(path, 'utf8'),
      ]),
  ),
);
const assets = [...sources.keys()];
const entries = assets.filter((path) =>
  /^index-[^.]+\.js$/.test(basename(path)),
);
if (entries.length !== 1) throw Error('Missing or ambiguous client entry');
const routes = (await filesIn('apps/web/src/routes'))
  .map((path) => relative('apps/web/src/routes', path))
  .filter((name) => name.endsWith('.tsx') && name !== '__root.tsx')
  .map((name) => name.slice(0, -4).replaceAll('/', '.'));
const routeAssets = new Map(
  routes.map((route) => [route, routeEntries(route, routes, assets)]),
);
const allRoutes = new Set([...routeAssets.values()].flat());
const limits = new Map([
  ['index', 125],
  ['f.$publicId', 170],
  ['_account.workspaces.$workspaceId.forms.$formId', 190],
  ['_account.workspaces.$workspaceId.responses.$formId', 175],
]);
for (const [route, selected] of routeAssets) {
  const deferred = new Set(
    [...allRoutes].filter((asset) => !selected.includes(asset)),
  );
  const graph = collectRouteGraph(sources, [...entries, ...selected], deferred);
  const bytes = [...graph].reduce(
    (sum, name) => sum + gzipSync(sources.get(name)).length,
    0,
  );
  const limit = limits.get(route) ?? 200;
  console.log(
    `${route}: ${(bytes / 1024).toFixed(2)} KiB JS gzip / ${limit} KiB`,
  );
  if (bytes > limit * 1024) exceeded = true;
}
const fontBytes = (await stat('design/fonts/dm-sans-latin-variable.woff2'))
  .size;
console.log(`Primary font: ${(fontBytes / 1024).toFixed(2)} KiB / 40 KiB`);
if (fontBytes > 40 * 1024) exceeded = true;
for (const file of sizes.sort((a, b) => b.bytes - a.bytes).slice(0, 5))
  console.log(`${(file.bytes / 1024).toFixed(2)} KiB ${file.path}`);
if (exceeded) {
  console.error('Bundle budget exceeded. Investigate before shipping.');
  process.exitCode = 1;
}
