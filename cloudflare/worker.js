export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const send = (status, body) => new Response(JSON.stringify(body), { status, headers: Object.assign({ 'content-type': 'application/json' }, corsHeaders()) });

    try {
      if (url.pathname === '/api/hit' || url.pathname === '/api/online/ping' || url.pathname === '/api/online/leave' || url.pathname === '/api/online/get') {
        const payload = request.method === 'POST' ? await request.json().catch(() => ({})) : Object.fromEntries(url.searchParams);
        const ns = (payload.ns || '').toString().trim();
        if (!ns) return send(400, { error: 'missing ns' });
        const id = env.COUNTER_DO.idFromName(ns);
        const stub = env.COUNTER_DO.get(id);
        const res = await stub.fetch('https://do' + url.pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        return send(200, data);
      }
      return send(404, { error: 'not_found' });
    } catch (e) {
      return send(500, { error: 'server_error', message: e.message });
    }
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

export class CounterDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // token -> lastSeen (ms)
    this.TZ = 7; // GMT+7
  }

  async fetch(request) {
    const url = new URL(request.url);
    const payload = request.method === 'POST' ? await request.json().catch(() => ({})) : Object.fromEntries(url.searchParams);
    if (url.pathname === '/api/hit') return this.hit();
    if (url.pathname === '/api/online/ping') return this.ping(payload);
    if (url.pathname === '/api/online/leave') return this.leave(payload);
    if (url.pathname === '/api/online/get') return this.getOnline();
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }

  nowLocal() { return new Date(Date.now() + this.TZ * 3600 * 1000); }
  dayKey() {
    const d = this.nowLocal(); const y=d.getUTCFullYear(); const m=('0'+(d.getUTCMonth()+1)).slice(-2); const day=('0'+d.getUTCDate()).slice(-2);
    return `day-${y}${m}${day}`;
  }
  monthKey() { const d=this.nowLocal(); const y=d.getUTCFullYear(); const m=('0'+(d.getUTCMonth()+1)).slice(-2); return `month-${y}${m}`; }

  async hit() {
    const totalKey = 'total';
    const dayKey = this.dayKey();
    const monthKey = this.monthKey();
    const keys = [totalKey, dayKey, monthKey];
    const vals = await this.state.storage.get(keys);
    const total = (vals.get(totalKey) || 0) + 1;
    const today = (vals.get(dayKey) || 0) + 1;
    const month = (vals.get(monthKey) || 0) + 1;
    await this.state.storage.put({ [totalKey]: total, [dayKey]: today, [monthKey]: month });
    return json({ total, today, month });
  }

  cleanSessions() {
    const now = Date.now();
    const TTL = 20000; // 20s
    for (const [t, ts] of this.sessions.entries()) { if (now - ts > TTL) this.sessions.delete(t); }
  }
  async ping(payload) {
    this.cleanSessions();
    let { token } = payload || {};
    if (!token) token = crypto.randomUUID();
    this.sessions.set(token, Date.now());
    return json({ online: this.sessions.size, token });
  }
  async leave(payload) {
    const { token } = payload || {};
    if (token) this.sessions.delete(token);
    this.cleanSessions();
    return json({ online: this.sessions.size });
  }
  async getOnline() { this.cleanSessions(); return json({ online: this.sessions.size }); }
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } }); }

