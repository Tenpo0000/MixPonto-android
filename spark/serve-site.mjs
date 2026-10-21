import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.argv[2] || '../site-integration');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png' };
http.createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/src/index.html' : url.pathname)}`);
        if (!path.startsWith(root + sep)) throw new Error('Forbidden');
        const bytes = await readFile(path);
        response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
        response.end(bytes);
    } catch {
        response.writeHead(404);
        response.end('Not found');
    }
}).listen(8085, '127.0.0.1', () => process.stdout.write('MixPonto local: http://127.0.0.1:8085/src/mobile.html\n'));
