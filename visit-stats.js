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
      onlineStrategy: 'local'
    },
    els: {},
    init(userCfg) {
      this.cfg = Object.assign({}, this.cfg, userCfg || {});
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
      } else {
        this.updateWithLocal();
      }

      // Online indicator
      if (this.cfg.onlineStrategy === 'local') {
        this.onlineLocal();
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

    // ---------- CountAPI mode ----------
    async countapiHit(key) {
      const ns = encodeURIComponent(this.cfg.namespace);
      const k = encodeURIComponent(key);
      const url = `https://api.countapi.xyz/hit/${ns}/${k}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (typeof data.value === 'number') return data.value;
      throw new Error('Invalid CountAPI response');
    },
    async updateWithCountAPI() {
      const now = new Date();
      const dayKey = `day-${now.getFullYear()}${('0'+(now.getMonth()+1)).slice(-2)}${('0'+now.getDate()).slice(-2)}`;
      const monthKey = `month-${now.getFullYear()}${('0'+(now.getMonth()+1)).slice(-2)}`;

      try { this.setEl('total', await this.countapiHit('total')); } catch(e) {}
      try { this.setEl('today', await this.countapiHit(dayKey)); } catch(e) {}
      try { this.setEl('month', await this.countapiHit(monthKey)); } catch(e) {}
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

