import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'build');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, 'HAPZO_Decaste_ERP_Pilot.html'), join(output, 'index.html'));
await cp(join(root, 'netlify', '_redirects'), join(output, '_redirects'));

console.log(`Netlify-ready HAPZO site created at ${output}`);
