// Service worker: lets Trainer Desk be installed as an app and opens pages you've visited while offline.
// Same-origin only and always network first, so online visitors get the newest version of every page and the newest
// price files; the saved copy is used only when the network fails. Other sites (card/sprite images, the live APIs) are
// never touched: the app's own offline fallbacks cover those, and nothing from them is saved here.
// Bump VERSION to drop old saved copies after a big change.
const VERSION = 'v1';
const CACHE = 'td-' + VERSION;
const CORE = ['/', '/go', '/tcg', '/pokedex', '/arena', '/go/events', '/favicon.svg', '/site.webmanifest', '/assets/dex-page.css', '/assets/icons/icon-192.png'];
const NAV_TIMEOUT = 5000; // slow network: show the saved copy of a page after 5s (if there is one) rather than a blank screen

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('td-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const OFFLINE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline | Trainer Desk</title>
<style>body{margin:0;padding:24px 16px;font:18px/1.4 system-ui,sans-serif;background:#F4ECD8;color:#1B4332}a{display:inline-block;margin-top:12px;padding:12px 16px;min-height:44px;box-sizing:border-box;background:#1B4332;color:#fff;border-radius:4px;text-decoration:none}@media (prefers-color-scheme:dark){body{background:#0A1A11;color:#E8F0E8}a{background:#F2C14E;color:#0A1A11}}</style>
<h1>You're offline</h1><p>This page hasn't been saved on this device yet. Pages you've opened before still work offline.</p><a href="/">Open Trainer Desk</a></html>`;

function fromNetwork(req) {
  return fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/sw.js') return;
  const nav = req.mode === 'navigate';
  const saved = () => caches.match(req, { ignoreSearch: nav }); // /tcg?set=x offline → the saved /tcg
  const fallback = async () => (await saved()) || (nav ? new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) : Response.error());
  const net = fromNetwork(req);
  if (!nav) { e.respondWith(net.catch(fallback)); return; }
  e.respondWith(new Promise(resolve => {
    let done = false; const finish = r => { if (!done) { done = true; resolve(r); } };
    net.then(finish, () => fallback().then(finish));
    setTimeout(() => { if (!done) saved().then(hit => { if (hit) finish(hit); }); }, NAV_TIMEOUT); // slow, not offline: keep waiting if nothing is saved
  }));
});
