# Visit Stats Worker (Cloudflare)

This Worker provides reliable counters and global online presence for a static site (e.g., GitHub Pages).

## Features
- Hit endpoint increments: `total`, `today (YYYYMMDD)`, `month (YYYYMM)` in GMT+7.
- Global online presence with 20s TTL and token-based ping/leave.
- CORS enabled for any origin.
- Uses Durable Objects to ensure atomic updates.

## Endpoints
- POST `/api/hit` body: `{ ns: "<namespace>" }` → `{ total, today, month }`
- POST `/api/online/ping` body: `{ ns, token? }` → `{ online, token }`
- POST `/api/online/leave` body: `{ ns, token }` → `{ online }`

## Deploy
1. Install Wrangler and login
```
npm i -g wrangler
wrangler login
```
2. From this folder (`cloudflare/`):
```
wrangler publish
```
3. Note the Worker URL printed (e.g., `https://visit-stats-worker.your-subdomain.workers.dev`).

## Configure your site
In `index.html`, update the init to use the Worker:
```
VisitStats.init({
  mode: 'worker',
  namespace: 'ontinhoc-home',  // or 'auto'
  onlineStrategy: 'worker',
  baseUrl: 'https://visit-stats-worker.your-subdomain.workers.dev'
});
```

That’s it. The widget will call `/api/hit` on page load and keep `online` updated by pinging the Worker every ~10s, and decrement when the tab closes.

## Notes
- The Worker groups data by namespace (string). Use different namespaces for different sites if needed.
- Presence is kept in memory of the Durable Object and reset on object restart; it is intended as a realtime indicator, not a historical metric.
- You can change the presence TTL in `cloudflare/worker.js` (`TTL = 20000`).

