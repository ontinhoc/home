/* VisitStats plugin
 * - Shows: online (approx), today, month, total
 * - Modes:
 *    mode: 'countapi' -> uses https://api.countapi.xyz counters for totals/day/month
 *    mode: 'local'    -> uses localStorage demo counters (offline/testing)
 * - onlineStrategy:
 *    'local'  -> counts open tabs on this browser only (no backend)
 */
(function (global) {
  const VisitStats = {
    cfg: {
      mode: 'countapi',
      namespace: 'visit-stats',
      onlineStrategy: 'local',
      baseUrl: '' // for 'worker' mode
    },
    els: {},
    init(userCfg) {
      this.cfg = Object.assign({}, this.cfg, userCfg || {});
      if (!this.cfg.namespace || this.cfg.namespace === 'auto') {
        try {
          const base = (location.host + location.pathname).replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase();
          this.cfg.namespace = base || 'visit-stats';
        } catch(e){}
      }
      const box = document.getElementById('visit-stats');
      if (!box) return;
      this.els = {
        online: box.querySelector('[data-key="online"]'),
        today: box.querySelector('[data-key="today"]'),
        month: box.querySelector('[data-key="month"]'),
        total: box.querySelector('[data-key="total"]')
      };

      // Update counters
      if (this.cfg.mode === 'countapi') {
        this.updateWithCountAPI();
      } else if (this.cfg.mode === 'worker') {
        this.updateWithWorker();
      } else {
        this.updateWithLocal();
      }

      // Online indicator
      if (this.cfg.onlineStrategy === 'local') {
        this.onlineLocal();
      } else if (this.cfg.onlineStrategy === 'countapi') {
        this.onlineCountapi();
      } else if (this.cfg.onlineStrategy === 'worker') {
        this.onlineWorker();
      }
    },

    // ---------- Helpers ----------
    fmt(n) {
      try { return Number(n).toLocaleString('vi-VN'); } catch (e) { return String(n); }
    },
    setEl(key, val) {
      if (this.els[key]) this.els[key].textContent = this.fmt(val);
    },
    safeGetLS(key, def) {
      try { const v = localStorage.getItem(key); return v == null ? def : v; } catch(e) { return def; }
    },
    safeSetLS(key, val) {
      try { localStorage.setItem(key, String(val)); } catch(e) {}
    },

    // ---------- Worker mode (Cloudflare Worker) ----------
    async workerFetch(path, payload) {
      const base = (this.cfg.baseUrl || '').replace(/\/$/, '');
      if (!base) throw new Error('VisitStats: baseUrl not configured for worker mode');
      const url = base + path;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ ns: this.cfg.namespace }, payload || {})),
        cache: 'no-store',
        keepalive: true,
        mode: 'cors'
      });
      return res.json();
    },
    async updateWithWorker() {
      try {
        const data = await this.workerFetch('/api/hit');
        if (data && typeof data.total === 'number') this.setEl('total', data.total);
        if (data && typeof data.today === 'number') this.setEl('today', data.today);
        if (data && typeof data.month === 'number') this.setEl('month', data.month);
      } catch (e) {
        console && console.warn && console.warn('Worker hit failed; falling back local', e);
        this.updateWithLocal();
      }
    },
    async onlineWorker() {
      let token = this.safeGetLS('vs_worker_token_' + this.cfg.namespace, '');
      try {
        const data = await this.workerFetch('/api/online/ping', token ? { token } : {});
        if (data && data.token) { token = data.token; this.safeSetLS('vs_worker_token_' + this.cfg.namespace, token); }
        if (data && typeof data.online === 'number') this.setEl('online', data.online);
      } catch (e) {
        console && console.warn && console.warn('Worker online failed; fallback local', e);
        return this.onlineLocal();
      }
      const ping = async () => {
        try {
          const d = await this.workerFetch('/api/online/ping', { token });
          if (d && typeof d.online === 'number') this.setEl('online', d.online);
        } catch (e) {}
      };
      const leave = async () => { try { await this.workerFetch('/api/online/leave', { token }); } catch (e) {} };
      const iv = setInterval(ping, 10000);
      window.addEventListener('pagehide', () => { clearInterval(iv); leave(); }, { once: true });
      window.addEventListener('beforeunload', () => { clearInterval(iv); leave(); }, { once: true });
    },

    // ---------- CountAPI mode ----------
    async countapiEnsure(key) {
      const ns = encodeURIComponent(this.cfg.namespace);
      const k = encodeURIComponent(key);
      const url = `https://api.countapi.xyz/create?namespace=${ns}&key=${k}&value=0`;
      try { await fetch(url, { cache: 'no-store' }); } catch (e) {}
    },
    async countapiUpdate(key, amount = 1) {
      const ns = encodeURIComponent(this.cfg.namespace);
      const k = encodeURIComponent(key);
      const url = `https://api.countapi.xyz/update/${ns}/${k}?amount=${amount}`;
      const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
      const data = await res.json();
      if (typeof data.value === 'number') return data.value;
      throw new Error('Invalid CountAPI response');
    },
    async countapiGet(key) {
      const ns = encodeURIComponent(this.cfg.namespace);
      const k = encodeURIComponent(key);
      const url = `https://api.countapi.xyz/get/${ns}/${k}`;
      const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
      const data = await res.json();
      return typeof data.value === 'number' ? data.value : 0;
    },
    async updateWithCountAPI() {
      const now = new Date();
      const dayKey = `day-${now.getFullYear()}${('0'+(now.getMonth()+1)).slice(-2)}${('0'+now.getDate()).slice(-2)}`;
      const monthKey = `month-${now.getFullYear()}${('0'+(now.getMonth()+1)).slice(-2)}`;

      // Ensure keys exist, then update by +1 and show values
      try {
        await this.countapiEnsure('total');
        const total = await this.countapiUpdate('total', 1);
        this.setEl('total', total);
      } catch (e) { console && console.warn && console.warn('CountAPI total failed', e); }
      try {
        await this.countapiEnsure(dayKey);
        const today = await this.countapiUpdate(dayKey, 1);
        this.setEl('today', today);
      } catch (e) { console && console.warn && console.warn('CountAPI today failed', e); }
      try {
        await this.countapiEnsure(monthKey);
        const month = await this.countapiUpdate(monthKey, 1);
        this.setEl('month', month);
      } catch (e) { console && console.warn && console.warn('CountAPI month failed', e); }

      // Fallback: if any field still empty, use local to avoid blanks
      ['total','today','month'].forEach(k => {
        if (this.els[k] && (this.els[k].textContent.trim() === '' || this.els[k].textContent.trim() === '—')) {
          try { this.updateWithLocal(); } catch(e){}
        }
      });
    },

    // ---------- Online (global via CountAPI) ----------
    async onlineCountapi() {
      const key = 'online';
      let incremented = false;
      try {
        await this.countapiEnsure(key);
        const v = await this.countapiUpdate(key, 1);
        incremented = true;
        this.setEl('online', Math.max(0, v));
      } catch (e) {
        // Fallback to local presence if blocked
        return this.onlineLocal();
      }
      const updateView = async () => {
        try { const val = await this.countapiGet(key); this.setEl('online', Math.max(0, val)); } catch(e){}
      };
      updateView();
      const iv = setInterval(updateView, 10000);
      const decrement = async () => {
        try { if (incremented) await this.countapiUpdate(key, -1); } catch(e){}
        clearInterval(iv);
      };
      window.addEventListener('pagehide', decrement, { once: true });
      window.addEventListener('beforeunload', decrement, { once: true });
    },

    // ---------- Local demo mode ----------
    updateWithLocal() {
      const now = new Date();
      const dayKey = `vs_today_${now.getFullYear()}${('0'+(now.getMonth()+1)).slice(-2)}${('0'+now.getDate()).slice(-2)}`;
      const monthKey = `vs_month_${now.getFullYear()}${('0'+(now.getMonth()+1)).slice(-2)}`;
      const totalKey = `vs_total_${this.cfg.namespace}`;

      const inc = (key) => {
        let v = parseInt(this.safeGetLS(key, '0'), 10) || 0;
        v += 1; this.safeSetLS(key, v); return v;
      };

      this.setEl('today', inc(dayKey));
      this.setEl('month', inc(monthKey));
      this.setEl('total', inc(totalKey));
    },

    // ---------- Online (local, per-browser) ----------
    onlineLocal() {
      const ns = this.cfg.namespace;
      const tabId = Math.random().toString(36).slice(2);
      const prefix = `vs_presence_${ns}_`;
      const key = prefix + tabId;
      const ttl = 15_000; // 15s presence expiry

      const heartbeat = () => this.safeSetLS(key, Date.now());
      const cleanupAndCount = () => {
        const now = Date.now();
        let c = 0;
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix)) {
              const t = parseInt(localStorage.getItem(k) || '0', 10) || 0;
              if (now - t <= ttl) c++; else localStorage.removeItem(k);
            }
          }
        } catch (e) {}
        this.setEl('online', Math.max(c, 1));
      };

      heartbeat();
      cleanupAndCount();
      const hb = setInterval(() => { heartbeat(); cleanupAndCount(); }, 5000);
      window.addEventListener('visibilitychange', () => { if (!document.hidden) { heartbeat(); cleanupAndCount(); } });
      window.addEventListener('unload', () => { try { localStorage.removeItem(key); } catch(e) {} clearInterval(hb); });
    }
  };

  global.VisitStats = VisitStats;
})(window);
