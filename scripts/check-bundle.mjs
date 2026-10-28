import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

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
  ['js', 200 * 1024],
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
