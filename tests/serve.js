// Tiny static server for tests: mimics Vercel cleanUrls (/tcg -> tcg.html). Usage: const { serve } = require('./serve');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
exports.serve = () => new Promise(res => {
  const server = http.createServer((req, rsp) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    else if (!path.extname(p) && fs.existsSync(path.join(root, p + '.html'))) p += '.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
    rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
  });
  server.listen(0, () => res({ base: 'http://127.0.0.1:' + server.address().port, close: () => { server.close(); if (server.closeAllConnections) server.closeAllConnections(); } }));
});
