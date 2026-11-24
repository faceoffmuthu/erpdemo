import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicRoot = resolve(projectRoot, 'build');
const port = Number(process.env.HAPZO_PORT || 4380);
const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Set HAPZO_PORT to a port between 1024 and 65535.');
}

const server = createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  let filename = resolve(publicRoot, '.' + pathname);
  const rootPrefix = publicRoot.endsWith(sep) ? publicRoot : publicRoot + sep;
  if (filename !== publicRoot && !filename.toLowerCase().startsWith(rootPrefix.toLowerCase())) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    if (statSync(filename).isDirectory()) filename = join(filename, 'index.html');
    if (!statSync(filename).isFile()) throw new Error('Not a file');
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': types.get(extname(filename).toLowerCase()) || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(filename).pipe(response);
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Set HAPZO_PORT to another port, for example 4381.`);
    process.exitCode = 1;
    return;
  }
  throw error;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`HAPZO Frontend Preview · http://127.0.0.1:${port}`);
  console.log('Sample data only · changes are not saved');
});
