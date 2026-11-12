import type { ChargilyCheckout } from './chargily.spec.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LABELS = {
  ar: {
    dir: 'rtl',
    title: 'بوابة الدفع التجريبية - Chargily Pay',
    badge: 'محاكاة محلية (وضع الاختبار)',
    amount: 'المبلغ المطلوب',
    method: 'وسيلة الدفع',
    status: 'الحالة الحالية',
    pay: 'تأكيد الدفع (نجاح)',
    decline: 'بطاقة مرفوضة',
    insufficient: 'رصيد غير كافٍ',
    expired: 'بطاقة منتهية الصلاحية',
    cancel: 'إلغاء العملية',
    disclaimer: 'بيئة محاكاة محلية — لا تدخل بيانات بطاقة حقيقية.',
  },
  fr: {
    dir: 'ltr',
    title: 'Page de paiement simulée - Chargily Pay',
    badge: 'Sandbox local (Mode Test)',
    amount: 'Montant à payer',
    method: 'Moyen de paiement',
    status: 'Statut actuel',
    pay: 'Payer maintenant (Succès)',
    decline: 'Carte refusée',
    insufficient: 'Solde insuffisant',
    expired: 'Carte expirée',
    cancel: 'Annuler le paiement',
    disclaimer: 'Simulation locale — n’utilisez jamais de vraies cartes.',
  },
  en: {
    dir: 'ltr',
    title: 'Simulated Checkout - Chargily Pay',
    badge: 'Local Sandbox (Test Mode)',
    amount: 'Amount Due',
    method: 'Payment Method',
    status: 'Current Status',
    pay: 'Pay Now (Success)',
    decline: 'Card Declined',
    insufficient: 'Insufficient Funds',
    expired: 'Expired Card',
    cancel: 'Cancel Payment',
    disclaimer: 'Local simulation — never enter real card credentials.',
  },
} as const;

export function renderChargilyHostedPage(checkout: ChargilyCheckout): string {
  const t = LABELS[checkout.locale] ?? LABELS.ar;
  return `<!doctype html>
<html lang="${checkout.locale}" dir="${t.dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(t.title)}</title>
  <style>
    :root { --bg:#0f172a; --card:#1e293b; --text:#f8fafc; --muted:#94a3b8; --ok:#10b981; --warn:#f59e0b; --bad:#ef4444; --border:#334155; }
    body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:var(--bg); color:var(--text); display:flex; min-height:100vh; align-items:center; justify-content:center; padding:16px; }
    .card { width:100%; max-width:440px; background:var(--card); border:1px solid var(--border); border-radius:14px; padding:24px; box-shadow:0 20px 40px rgba(0,0,0,.35); }
    .badge { display:inline-block; font-size:12px; padding:4px 10px; border-radius:999px; background:#1d4ed8; color:#dbeafe; margin-bottom:12px; }
    h1 { font-size:20px; margin:0 0 16px; }
    .row { display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border); font-size:14px; }
    .row span:first-child { color:var(--muted); }
    .actions { display:grid; gap:10px; margin-top:20px; }
    button { width:100%; padding:11px 14px; border:none; border-radius:8px; font-weight:600; cursor:pointer; font-size:14px; }
    .btn-ok { background:var(--ok); color:#052e16; }
    .btn-bad { background:var(--bad); color:#fff; }
    .btn-warn { background:var(--warn); color:#451a03; }
    .btn-muted { background:#334155; color:#f8fafc; }
    .note { margin-top:16px; font-size:12px; color:var(--muted); text-align:center; }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">${escapeHtml(t.badge)}</span>
    <h1>${escapeHtml(t.title)}</h1>
    <div class="row"><span>ID</span><code>${escapeHtml(checkout.id)}</code></div>
    <div class="row"><span>${escapeHtml(t.amount)}</span><strong>${checkout.amount} ${escapeHtml(checkout.currency.toUpperCase())}</strong></div>
    <div class="row"><span>${escapeHtml(t.method)}</span><span>${escapeHtml(checkout.payment_method ?? 'edahabia')}</span></div>
    <div class="row"><span>${escapeHtml(t.status)}</span><strong id="checkout-status">${escapeHtml(checkout.status)}</strong></div>

    <form class="actions" method="POST" action="/pay/chargily/${encodeURIComponent(checkout.id)}/action">
      <button class="btn-ok" type="submit" name="action" value="success">${escapeHtml(t.pay)}</button>
      <button class="btn-bad" type="submit" name="action" value="declined">${escapeHtml(t.decline)}</button>
      <button class="btn-warn" type="submit" name="action" value="insufficient_funds">${escapeHtml(t.insufficient)}</button>
      <button class="btn-warn" type="submit" name="action" value="expired_card">${escapeHtml(t.expired)}</button>
      <button class="btn-muted" type="submit" name="action" value="user_cancelled">${escapeHtml(t.cancel)}</button>
    </form>

    <p class="note">${escapeHtml(t.disclaimer)}</p>
  </main>
</body>
</html>`;
}
