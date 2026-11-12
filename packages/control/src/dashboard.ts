import arLocale from './locales/ar.json' with { type: 'json' };
import enLocale from './locales/en.json' with { type: 'json' };
import frLocale from './locales/fr.json' with { type: 'json' };

export const DASHBOARD_LOCALES = {
  ar: arLocale,
  fr: frLocale,
  en: enLocale,
} as const;

export type DashboardLang = keyof typeof DASHBOARD_LOCALES;

export function renderDashboardHtml(): string {
  const localesJson = JSON.stringify(DASHBOARD_LOCALES);
  return `<!doctype html>
<html lang="ar" dir="rtl" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>dz-sandbox — Local Algerian Payment & Delivery Sandbox</title>
  <style>
    :root, [data-theme="dark"] {
      --bg: #0b1120;
      --surface: #111827;
      --surface-2: #1e293b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --border: #334155;
      --accent: #10b981;
      --accent-ink: #022c22;
      --danger: #ef4444;
      --warn: #f59e0b;
      --info: #3b82f6;
    }
    [data-theme="light"] {
      --bg: #f8fafc;
      --surface: #ffffff;
      --surface-2: #f1f5f9;
      --text: #0f172a;
      --muted: #475569;
      --border: #cbd5e1;
      --accent: #059669;
      --accent-ink: #ffffff;
      --danger: #dc2626;
      --warn: #d97706;
      --info: #2563eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    a, button, input, select, textarea { font: inherit; }
    button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 14px 20px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand h1 { margin: 0; font-size: 20px; letter-spacing: -0.02em; }
    .tagline { color: var(--muted); font-size: 13px; }
    .toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .btn {
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
      padding: 7px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .btn-accent { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
    .btn-danger { background: var(--danger); color: #fff; border-color: transparent; }
    .nav {
      display: flex;
      gap: 6px;
      padding: 10px 20px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }
    .nav button[aria-selected="true"] {
      background: var(--accent);
      color: var(--accent-ink);
      border-color: transparent;
    }
    main { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
    }
    .card h2, .card h3 { margin-top: 0; font-size: 16px; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: var(--surface-2);
      border: 1px solid var(--border);
    }
    .badge.ok { color: var(--accent); border-color: var(--accent); }
    .badge.bad { color: var(--danger); border-color: var(--danger); }
    .badge.warn { color: var(--warn); border-color: var(--warn); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: start; padding: 10px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
    pre {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      overflow-x: auto;
      font-size: 12px;
      direction: ltr;
      text-align: left;
    }
    input, select, textarea {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 13px;
    }
    .row-flex { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .hidden { display: none; }
    footer {
      max-width: 1200px;
      margin: 24px auto;
      padding: 0 20px;
      font-size: 12px;
      color: var(--muted);
    }
    iframe { width: 100%; height: 480px; border: 1px solid var(--border); border-radius: 10px; background: #0f172a; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <h1 id="brand-title">dz-sandbox</h1>
      <span class="tagline" id="brand-tagline"></span>
    </div>
    <div class="toolbar">
      <label class="hidden" for="lang-select">Language</label>
      <select id="lang-select" aria-label="Language">
        <option value="ar">العربية (RTL)</option>
        <option value="fr">Français</option>
        <option value="en">English</option>
      </select>
      <button class="btn" id="theme-btn" type="button"></button>
      <button class="btn btn-danger" id="reset-btn" type="button"></button>
    </div>
  </header>

  <nav class="nav" role="tablist" aria-label="Dashboard sections">
    <button class="btn" role="tab" data-tab="overview" aria-selected="true"></button>
    <button class="btn" role="tab" data-tab="requests" aria-selected="false"></button>
    <button class="btn" role="tab" data-tab="webhooks" aria-selected="false"></button>
    <button class="btn" role="tab" data-tab="scenarios" aria-selected="false"></button>
    <button class="btn" role="tab" data-tab="preview" aria-selected="false"></button>
    <button class="btn" role="tab" data-tab="clock" aria-selected="false"></button>
  </nav>

  <main>
    <section id="tab-overview" role="tabpanel"></section>
    <section id="tab-requests" role="tabpanel" class="hidden"></section>
    <section id="tab-webhooks" role="tabpanel" class="hidden"></section>
    <section id="tab-scenarios" role="tabpanel" class="hidden"></section>
    <section id="tab-preview" role="tabpanel" class="hidden"></section>
    <section id="tab-clock" role="tabpanel" class="hidden"></section>
  </main>

  <footer id="disclaimer-footer"></footer>

  <script>
    const LOCALES = ${localesJson};
    let lang = 'ar';
    let currentTab = 'overview';
    let lastState = null;
    let lastScenarios = [];
    let lastRequests = [];
    let lastWebhooks = [];
    let reqFilter = '';

    function t(path) {
      const parts = path.split('.');
      let cur = LOCALES[lang] || LOCALES.ar;
      for (const p of parts) cur = cur && cur[p];
      return cur ?? path;
    }

    function esc(v) {
      return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function applyLocaleChrome() {
      const loc = LOCALES[lang] || LOCALES.ar;
      document.documentElement.lang = loc.lang;
      document.documentElement.dir = loc.dir;
      document.getElementById('brand-title').textContent = loc.brand;
      document.getElementById('brand-tagline').textContent = loc.tagline;
      document.getElementById('theme-btn').textContent = loc.themeToggle;
      document.getElementById('reset-btn').textContent = loc.resetBtn;
      document.getElementById('disclaimer-footer').textContent = loc.disclaimer;
      document.querySelectorAll('[role="tab"]').forEach((btn) => {
        const key = btn.getAttribute('data-tab');
        btn.textContent = loc.tabs[key] || key;
        btn.setAttribute('aria-selected', String(key === currentTab));
      });
    }

    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('[role="tabpanel"]').forEach((el) => {
        el.classList.toggle('hidden', el.id !== 'tab-' + tab);
      });
      applyLocaleChrome();
      renderActiveTab();
    }

    async function api(path, opts) {
      const res = await fetch(path, opts);
      return res.json();
    }

    async function refreshAll() {
      const [state, scenData, reqData, whData] = await Promise.all([
        api('/__control/state'),
        api('/__control/scenarios'),
        api('/__control/requests' + (reqFilter ? '?provider=' + encodeURIComponent(reqFilter) : '')),
        api('/__control/webhooks'),
      ]);
      lastState = state;
      lastScenarios = scenData.scenarios || [];
      lastRequests = reqData.requests || [];
      lastWebhooks = whData.webhooks || [];
      renderActiveTab();
    }

    function buildCurl(req) {
      const portMap = { chargily: 4001, satim: 4002, yalidine: 4003 };
      const port = portMap[req.provider] || 4000;
      const headers = Object.entries(req.headers || {})
        .filter(([k]) => !['host','content-length','connection'].includes(k.toLowerCase()))
        .map(([k, v]) => '-H "' + k + ': ' + v + '"')
        .join(' ');
      const bodyPart = req.body && Object.keys(req.body).length ? " -d '" + JSON.stringify(req.body) + "'" : '';
      return 'curl -X ' + req.method + ' "http://127.0.0.1:' + port + req.path + '" ' + headers + bodyPart;
    }

    function renderActiveTab() {
      if (!lastState) return;
      if (currentTab === 'overview') renderOverview();
      if (currentTab === 'requests') renderRequests();
      if (currentTab === 'webhooks') renderWebhooks();
      if (currentTab === 'scenarios') renderScenarios();
      if (currentTab === 'preview') renderPreview();
      if (currentTab === 'clock') renderClock();
    }

    function renderOverview() {
      const providers = ['chargily', 'satim', 'yalidine'];
      const cards = providers.map((p) => {
        const cur = (lastState.defaults && lastState.defaults[p]) || (p === 'yalidine' ? 'created_ok' : 'success');
        return '<div class="card"><h3>' + esc(p.toUpperCase()) + '</h3>' +
          '<p><span class="badge ok">online</span></p>' +
          '<p>' + esc(t('overview.activeScenario')) + ': <code>' + esc(cur) + '</code></p>' +
          '</div>';
      }).join('');

      document.getElementById('tab-overview').innerHTML =
        '<div class="grid">' + cards + '</div>' +
        '<div class="grid" style="margin-top:16px">' +
          '<div class="card"><h3>' + esc(t('overview.requestsTotal')) + '</h3><strong>' + lastState.requestCount + '</strong></div>' +
          '<div class="card"><h3>' + esc(t('overview.webhooksTotal')) + '</h3><strong>' + lastState.webhookCount + '</strong></div>' +
          '<div class="card"><h3>' + esc(t('overview.clockNow')) + '</h3><code>' + esc(lastState.clockIso) + '</code></div>' +
        '</div>';
    }

    function renderRequests() {
      const rows = lastRequests.map((r, i) =>
        '<tr>' +
          '<td><code>' + esc(r.provider) + '</code></td>' +
          '<td><strong>' + esc(r.method) + '</strong> <code>' + esc(r.path) + '</code></td>' +
          '<td><span class="badge ' + (r.statusCode >= 400 ? 'bad' : 'ok') + '">' + r.statusCode + '</span></td>' +
          '<td><code>' + esc(r.scenario) + '</code></td>' +
          '<td><button class="btn" type="button" onclick="copyCurl(' + i + ')">' + esc(t('requests.copyCurl')) + '</button></td>' +
        '</tr>' +
        '<tr><td colspan="5"><pre>' + esc(JSON.stringify({ req: r.body, res: r.responseBody }, null, 2)) + '</pre></td></tr>'
      ).join('');

      document.getElementById('tab-requests').innerHTML =
        '<div class="card">' +
          '<div class="row-flex" style="margin-bottom:12px">' +
            '<label>' + esc(t('requests.filterProvider')) + ': ' +
              '<select onchange="setReqFilter(this.value)">' +
                '<option value="">' + esc(t('requests.all')) + '</option>' +
                '<option value="chargily"' + (reqFilter === 'chargily' ? ' selected' : '') + '>chargily</option>' +
                '<option value="satim"' + (reqFilter === 'satim' ? ' selected' : '') + '>satim</option>' +
                '<option value="yalidine"' + (reqFilter === 'yalidine' ? ' selected' : '') + '>yalidine</option>' +
              '</select>' +
            '</label>' +
          '</div>' +
          (rows ? '<table><tbody>' + rows + '</tbody></table>' : '<p>' + esc(t('requests.noData')) + '</p>') +
        '</div>';
    }

    function renderWebhooks() {
      const rows = lastWebhooks.map((w) =>
        '<tr>' +
          '<td><code>' + esc(w.provider) + '</code></td>' +
          '<td><code>' + esc(w.eventType) + '</code></td>' +
          '<td><span class="badge ' + (w.status === 'delivered' ? 'ok' : w.status === 'suppressed' ? 'warn' : 'bad') + '">' + esc(w.status) + '</span></td>' +
          '<td><code>' + esc((w.signature || '').slice(0, 16)) + '...</code> (' + (w.signatureValid ? 'valid' : 'INVALID') + ')</td>' +
          '<td>' + (w.attempts ? w.attempts.length : 0) + '</td>' +
          '<td><button class="btn" type="button" onclick="redeliverHook(\\'' + esc(w.id) + '\\')">' + esc(t('webhooks.redeliver')) + '</button></td>' +
        '</tr>'
      ).join('');

      document.getElementById('tab-webhooks').innerHTML =
        '<div class="card" style="margin-bottom:16px">' +
          '<h3>' + esc(t('webhooks.triggerTitle')) + '</h3>' +
          '<div class="row-flex">' +
            '<select id="trig-provider"><option value="chargily">chargily</option><option value="yalidine">yalidine</option></select>' +
            '<input id="trig-event" value="checkout.paid" />' +
            '<input id="trig-url" value="http://127.0.0.1:3100/webhooks/chargily" style="min-width:260px" />' +
            '<button class="btn btn-accent" type="button" onclick="triggerManualHook()">' + esc(t('webhooks.triggerBtn')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="card">' +
          (rows ? '<table><tbody>' + rows + '</tbody></table>' : '<p>' + esc(t('webhooks.noData')) + '</p>') +
        '</div>';
    }

    function renderScenarios() {
      const options = lastScenarios.map((s) => '<option value="' + esc(s.name) + '">' + esc(s.name) + ' (' + esc(s.category) + ')</option>').join('');
      const list = lastScenarios.map((s) =>
        '<tr><td><code>' + esc(s.name) + '</code></td><td>' + esc(s.provider) + '</td><td>' + esc(s.description) + '</td><td><span class="badge">' + esc(s.builtIn ? t('scenarios.builtIn') : t('scenarios.custom')) + '</span></td></tr>'
      ).join('');

      document.getElementById('tab-scenarios').innerHTML =
        '<div class="card" style="margin-bottom:16px">' +
          '<h3>' + esc(t('scenarios.setProvider')) + '</h3>' +
          '<div class="row-flex">' +
            '<select id="scen-provider"><option value="chargily">chargily</option><option value="satim">satim</option><option value="yalidine">yalidine</option></select>' +
            '<select id="scen-name">' + options + '</select>' +
            '<button class="btn btn-accent" type="button" onclick="applyProviderScenario()">' + esc(t('scenarios.apply')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="card" style="margin-bottom:16px">' +
          '<h3>' + esc(t('scenarios.customTitle')) + '</h3>' +
          '<textarea id="custom-scen-json" rows="4" style="width:100%">{"name":"my_custom_slow","provider":"chargily","category":"network","description":"500ms latency","behavior":{"latencyMs":500}}</textarea>' +
          '<div style="margin-top:8px"><button class="btn" type="button" onclick="registerCustomScenario()">' + esc(t('scenarios.createBtn')) + '</button></div>' +
        '</div>' +
        '<div class="card"><table><tbody>' + list + '</tbody></table></div>';
    }

    function renderPreview() {
      document.getElementById('tab-preview').innerHTML =
        '<div class="card">' +
          '<h3>' + esc(t('preview.title')) + '</h3>' +
          '<p>' + esc(t('preview.desc')) + '</p>' +
          '<div class="row-flex" style="margin-bottom:12px">' +
            '<input id="preview-url" placeholder="http://127.0.0.1:4001/pay/chargily/chk_..." style="flex:1;min-width:260px" />' +
            '<button class="btn btn-accent" type="button" onclick="loadPreviewFrame()">' + esc(t('preview.openUrl')) + '</button>' +
          '</div>' +
          '<iframe id="preview-frame" title="Hosted payment page preview"></iframe>' +
        '</div>';
    }

    function renderClock() {
      const timers = (lastState.pendingTimersList || []).map((tm) =>
        '<li><code>' + esc(tm.fireAtIso) + '</code> — ' + esc(tm.label) + '</li>'
      ).join('');
      document.getElementById('tab-clock').innerHTML =
        '<div class="card">' +
          '<h3>' + esc(t('clock.current')) + '</h3>' +
          '<p><code>' + esc(lastState.clockIso) + '</code></p>' +
          '<div class="row-flex" style="margin-bottom:12px">' +
            '<button class="btn" type="button" onclick="advanceClock(\\'5m\\')">+5m</button>' +
            '<button class="btn" type="button" onclick="advanceClock(\\'15m\\')">+15m</button>' +
            '<button class="btn" type="button" onclick="advanceClock(\\'1h\\')">+1h</button>' +
            '<button class="btn" type="button" onclick="advanceClock(\\'24h\\')">+24h</button>' +
            '<input id="clock-custom" placeholder="' + esc(t('clock.customDuration')) + '" />' +
            '<button class="btn btn-accent" type="button" onclick="advanceClock(document.getElementById(\\'clock-custom\\').value)">' + esc(t('clock.advance')) + '</button>' +
            '<button class="btn btn-danger" type="button" onclick="resetClock()">' + esc(t('clock.reset')) + '</button>' +
          '</div>' +
          '<h3>' + esc(t('clock.pending')) + ' (' + lastState.pendingTimers + ')</h3>' +
          '<ul>' + (timers || '<li>—</li>') + '</ul>' +
        '</div>';
    }

    window.setReqFilter = (val) => { reqFilter = val; refreshAll(); };
    window.copyCurl = (idx) => {
      const req = lastRequests[idx];
      if (req && navigator.clipboard) navigator.clipboard.writeText(buildCurl(req));
    };
    window.redeliverHook = async (id) => {
      await api('/__control/webhooks/' + encodeURIComponent(id) + '/redeliver', { method: 'POST' });
      refreshAll();
    };
    window.triggerManualHook = async () => {
      const p = document.getElementById('trig-provider').value;
      const ev = document.getElementById('trig-event').value;
      const url = document.getElementById('trig-url').value;
      await api('/__control/trigger/' + encodeURIComponent(p) + '/' + encodeURIComponent(ev), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: url }),
      });
      refreshAll();
    };
    window.applyProviderScenario = async () => {
      const p = document.getElementById('scen-provider').value;
      const s = document.getElementById('scen-name').value;
      await api('/__control/scenario/' + encodeURIComponent(p), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: s }),
      });
      refreshAll();
    };
    window.registerCustomScenario = async () => {
      const raw = JSON.parse(document.getElementById('custom-scen-json').value);
      await api('/__control/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(raw),
      });
      refreshAll();
    };
    window.loadPreviewFrame = () => {
      const u = document.getElementById('preview-url').value;
      if (u) document.getElementById('preview-frame').src = u;
    };
    window.advanceClock = async (duration) => {
      if (!duration) return;
      await api('/__control/clock/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration }),
      });
      refreshAll();
    };
    window.resetClock = async () => {
      await api('/__control/clock/reset', { method: 'POST' });
      refreshAll();
    };

    document.getElementById('lang-select').addEventListener('change', (e) => {
      lang = e.target.value;
      applyLocaleChrome();
      renderActiveTab();
    });
    document.getElementById('theme-btn').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
    });
    document.getElementById('reset-btn').addEventListener('click', async () => {
      await api('/__control/reset', { method: 'POST' });
      refreshAll();
    });
    document.querySelectorAll('[role="tab"]').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    applyLocaleChrome();
    refreshAll();
  </script>
</body>
</html>`;
}
