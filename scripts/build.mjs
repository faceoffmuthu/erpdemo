import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'build');
const require = createRequire(import.meta.url);
const copiedModules = new Set();

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Publish the full ERP/DPP frontend at the site root.
await cp(join(root, 'public'), output, { recursive: true, force: true });
await cp(require.resolve('jsqr'), join(output, 'qr-reader.js'));

// Copy browser-facing domain modules and their local module dependencies.
async function copyModule(source) {
  source = resolve(source);
  if (!source.startsWith(join(root, 'src') + sep) || copiedModules.has(source)) return;
  copiedModules.add(source);
  const contents = await readFile(source, 'utf8');
  const imports = [...contents.matchAll(/(?:from\s*|import\s*\()\s*['"]((?:\.\.?\/|\/src\/)[^'"]+)['"]/g)];
  for (const [, specifier] of imports) {
    const dependency = specifier.startsWith('/src/') ? join(root, specifier.slice(1)) : resolve(dirname(source), specifier);
    if (dependency.endsWith('.mjs')) await copyModule(dependency);
  }
  const destination = join(output, relative(root, source));
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { force: true });
}

for (const name of await import('node:fs/promises').then(fs => fs.readdir(join(root, 'public')))) {
  if (!name.endsWith('.js')) continue;
  const contents = await readFile(join(root, 'public', name), 'utf8');
  for (const [, specifier] of contents.matchAll(/(?:from\s*|import\s*\()\s*['"]((?:\.\.?\/|\/src\/)[^'"]+)['"]/g)) {
    if (specifier.startsWith('/src/')) await copyModule(join(root, specifier.slice(1)));
  }
}

console.log(`Full HAPZO ERP/DPP frontend built at ${output}`);
