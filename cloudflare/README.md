# Cloudflare Worker For Static Hosting

This worker now serves two roles:

- Visit stats and online presence for the homepage
- Full exam API for `on-tnthpt-tin-hoc.html`

## Features

- CORS-enabled JSON API for a static frontend
- Durable Object storage for:
  - published and draft exams
  - student attempts and results
  - admin sessions
  - visit stats / online presence
- Compatible with GitHub Pages, Cloudflare Pages, or any static host

## Important Endpoints

### Visit stats
- `POST /api/hit`
- `POST /api/online/ping`
- `POST /api/online/leave`
- `GET /api/online/get`

### Exam system
- `GET /api/health`
- `POST /api/admin/login`
- `GET /api/exams`
- `GET /api/exams/:id`
- `POST /api/exams`
- `PUT /api/exams/:id`
- `DELETE /api/exams/:id`
- `POST /api/exams/:id/publish`
- `POST /api/exams/import`
- `GET /api/exams/:id/export`
- `POST /api/attempts/start`
- `PUT /api/attempts/:id/save`
- `POST /api/attempts/:id/submit`
- `GET /api/results?examId=...`
- `GET /api/results/:attemptId`

## Deploy

1. Install Wrangler and login:
```bash
npm i -g wrangler
wrangler login
```

2. From [cloudflare](c:\Users\csonline\Documents\home\cloudflare):
```bash
wrangler deploy
```

3. Optional but recommended: set an admin password secret
```bash
wrangler secret put ADMIN_PASSWORD
```

4. Preferred for this project: attach the worker to the custom API domain:
```text
https://api.ontapnhanh.com
```

If you have not attached the custom domain yet, the temporary Worker URL will look like:
```text
https://visit-stats-worker.your-subdomain.workers.dev
```

## Add `ontapnhanh.com` To The Current Cloudflare Account

The current Wrangler login is using the account for `www.congsu@gmail.com`. To make `api.ontapnhanh.com` work in that account:

1. In the Cloudflare dashboard, choose `Add a domain` and add `ontapnhanh.com`.
2. Complete the zone setup until Cloudflare shows the assigned nameservers.
3. At your domain registrar, replace the current nameservers with the Cloudflare nameservers for `ontapnhanh.com`.
4. Wait until the zone status in Cloudflare becomes `Active`.
5. In `DNS`, make sure `api.ontapnhanh.com` is not occupied by another record that conflicts with the Worker custom domain.
6. Keep the zone proxied by Cloudflare. The Worker custom domain bind will fail if Cloudflare does not own the active zone.
7. After the zone is active, run `wrangler deploy` again from this project to attach the Worker to `api.ontapnhanh.com`.

If the website itself is still hosted elsewhere, that is fine. The important part is that the DNS zone for `ontapnhanh.com` must be active in this same Cloudflare account before the Worker route can be bound.

## Connect The Static Frontend

In [on-tnthpt-tin-hoc.html](c:\Users\csonline\Documents\home\on-tnthpt-tin-hoc.html), set:

```html
<html lang="vi" data-api-base="https://api.ontapnhanh.com">
```

The frontend already supports this via `document.documentElement.dataset.apiBase`.

## Suggested Hosting Model

- Push static files to GitHub Pages or Cloudflare Pages for `ontapnhanh.com`
- Deploy the worker from `cloudflare/`
- Bind the worker to `api.ontapnhanh.com`
- Keep `data-api-base="https://api.ontapnhanh.com"`

That gives you a fully online version without running the local Node server.
