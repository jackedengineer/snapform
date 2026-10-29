import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectRouteGraph, routeEntries } from './bundle-graph.mjs';

test('counts transitive and side-effect imports once, including cycles and re-exports', () => {
  const sources = new Map([
    ['entry.js', 'import "./shared.js"; import("./other-route.js");'],
    ['screen.js', 'export {value} from "./shared.js";'],
    ['shared.js', 'import "./nested/helper.js"; export const value=1;'],
    ['nested/helper.js', 'import "../shared.js";'],
    ['other-route.js', 'export default "lazy";'],
  ]);
  assert.deepEqual(
    [
      ...collectRouteGraph(
        sources,
        ['entry.js', 'screen.js'],
        new Set(['other-route.js']),
      ),
    ].sort(),
    ['entry.js', 'nested/helper.js', 'screen.js', 'shared.js'],
  );
  assert.equal(
    collectRouteGraph(sources, ['entry.js', 'screen.js']).size,
    5,
    'non-route dynamic features count conservatively',
  );
});
test('fails closed on missing entries, missing imports, escaping paths and external browser modules', () => {
  for (const [sources, entry] of [
    [new Map(), 'missing.js'],
    [new Map([['entry.js', 'import "./missing.js";']]), 'entry.js'],
    [new Map([['entry.js', 'import "../outside.js";']]), 'entry.js'],
    [
      new Map([['entry.js', 'import "https://unrelated.invalid/tracker.js";']]),
      'entry.js',
    ],
    [new Map([['entry.js', 'import(target);']]), 'entry.js'],
  ])
    assert.throws(() => collectRouteGraph(sources, [entry]));
});
test('includes emitted account layouts and requires each route artifact unambiguously', () => {
  const assets = [
    'entry-123.js',
    '_account-123.js',
    '_account.workspaces._workspaceId-123.js',
    '_account.workspaces._workspaceId.forms._formId-123.js',
  ];
  const routes = [
    '_account',
    '_account.workspaces.$workspaceId',
    '_account.workspaces.$workspaceId.forms.$formId',
  ];
  assert.deepEqual(routeEntries(routes[2], routes, assets), assets.slice(1));
  assert.throws(() => routeEntries('login', ['login'], assets));
  assert.throws(() =>
    routeEntries('login', ['login'], ['login-a.js', 'login-b.js']),
  );
  assert.throws(() => routeEntries('unknown', routes, assets));
});
test('counts template imports and never defers an eagerly imported route', () => {
  const sources = new Map([
    ['entry.js', 'import "./other-route.js"; import(`./feature.js`);'],
    ['other-route.js', 'export default 1;'],
    ['feature.js', 'export default 2;'],
  ]);
  assert.equal(
    collectRouteGraph(sources, ['entry.js'], new Set(['other-route.js'])).size,
    3,
  );
});
