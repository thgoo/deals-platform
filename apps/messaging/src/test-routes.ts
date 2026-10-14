import { Hono } from 'hono';
import { config } from './config';

export const testRoutes = new Hono();

testRoutes.get('/sw.js', (c) => {
  return new Response(`
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Bargah', {
      body: data.body ?? '',
      icon: '/favicon.ico',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (url) event.waitUntil(clients.openWindow(url));
});
  `.trim(), { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
});

testRoutes.get('/', (c) => {
  const publicKey = config.vapid.publicKey;
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Messaging Service — Push Test</title>
  <style>
    body { font-family: monospace; max-width: 640px; margin: 2rem auto; padding: 0 1rem; background: #0a0a0b; color: #f4f4f5; }
    h1 { color: #f59e0b; }
    button { background: #f59e0b; color: #09090b; border: none; padding: .5rem 1rem; cursor: pointer; font-size: 1rem; border-radius: 4px; margin-right: .5rem; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    pre { background: #141416; border: 1px solid rgba(255,255,255,.07); padding: 1rem; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; font-size: .8rem; }
    .status { margin: 1rem 0; padding: .5rem; border-radius: 4px; }
    .ok   { background: rgba(74,222,128,.15); color: #4ade80; }
    .err  { background: rgba(248,113,113,.15); color: #f87171; }
    .info { background: rgba(96,165,250,.15); color: #60a5fa; }
  </style>
</head>
<body>
  <h1>🔔 Push Test</h1>
  <p>Click <strong>Subscribe</strong>, copy the JSON and use the curl below to fire a push.</p>

  <button id="btn-subscribe">Subscribe</button>
  <button id="btn-copy" disabled>Copy JSON</button>

  <div id="status"></div>
  <pre id="output">—</pre>

  <h2>Test curl</h2>
  <pre id="curl-example">Subscribe first to generate the curl command.</pre>

  <script>
    const VAPID_PUBLIC_KEY = '${publicKey}';

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
    }

    function setStatus(msg, type = 'info') {
      document.getElementById('status').innerHTML =
        \`<div class="status \${type}">\${msg}</div>\`;
    }

    document.getElementById('btn-subscribe').onclick = async () => {
      try {
        setStatus('Registering service worker...', 'info');

        // Unregister any existing SWs to avoid stale state
        const existing = await navigator.serviceWorker.getRegistrations();
        await Promise.all(existing.map(r => r.unregister()));

        const reg = await navigator.serviceWorker.register('/test/sw.js');

        // Wait for activation via registration state (avoids navigator.serviceWorker.ready quirks)
        await new Promise((resolve, reject) => {
          if (reg.active) return resolve(undefined);
          const sw = reg.installing ?? reg.waiting;
          if (!sw) return reject(new Error('Service worker not found'));
          const timer = setTimeout(() => reject(new Error('Service worker activation timeout')), 5000);
          sw.addEventListener('statechange', function handler() {
            if (this.state === 'activated') {
              clearTimeout(timer);
              sw.removeEventListener('statechange', handler);
              resolve(undefined);
            }
          });
        });

        setStatus('Requesting notification permission...', 'info');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setStatus('Permission denied.', 'err');
          return;
        }

        setStatus('Creating push subscription...', 'info');
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        document.getElementById('output').textContent = JSON.stringify(sub.toJSON(), null, 2);
        document.getElementById('btn-copy').disabled = false;
        setStatus('✅ Subscribed! Copy the JSON below.', 'ok');

        const payload = JSON.stringify({
          recipient: { type: 'web-push', subscription: sub.toJSON() },
          message: { title: '🔔 It works!', body: 'Push delivered by messaging-service', url: '/' }
        });
        document.getElementById('curl-example').textContent =
          \`curl -X POST http://localhost:3002/notify \\\\\\n  -H "Content-Type: application/json" \\\\\\n  -d '\${payload}'\`;
      } catch (err) {
        setStatus(\`Error: \${err.message}\`, 'err');
      }
    };

    document.getElementById('btn-copy').onclick = () => {
      navigator.clipboard.writeText(document.getElementById('output').textContent);
      setStatus('Copied!', 'ok');
    };
  </script>
</body>
</html>`);
});
