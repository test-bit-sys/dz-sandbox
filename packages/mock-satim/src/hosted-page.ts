import { SATIM_SPEC } from './satim.spec.js';
import type { SatimOrder } from './state-machine.js';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const I18N = {
  ar: {
    dir: 'rtl',
    title: 'بوابة الدفع SATIM (محاكاة محلية)',
    badge: 'محاكاة غير رسمية — لا تستخدم بطاقة حقيقية',
    order: 'رقم الطلب',
    amount: 'المبلغ (بالسنتيم)',
    card: 'رقم البطاقة التجريبية الوهمية',
    submit: 'إرسال الدفع',
    cancel: 'إلغاء والعودة',
  },
  fr: {
    dir: 'ltr',
    title: 'Portail de paiement SATIM (Simulation)',
    badge: 'Non officiel — N’utilisez jamais une vraie carte',
    order: 'Référence commande',
    amount: 'Montant (centimes)',
    card: 'Numéro de carte de test fictive',
    submit: 'Valider le paiement',
    cancel: 'Annuler et retourner',
  },
  en: {
    dir: 'ltr',
    title: 'SATIM Payment Gateway (Local Simulation)',
    badge: 'Unofficial Simulation — Never enter a real card',
    order: 'Order Number',
    amount: 'Amount (centimes)',
    card: 'Fake Test Card Number',
    submit: 'Submit Payment',
    cancel: 'Cancel & Return',
  },
} as const;

export function renderSatimHostedPage(order: SatimOrder): string {
  const t = I18N[order.language] ?? I18N.ar;
  const dzd = (order.amount / 100).toFixed(2);
  const cardsHtml = SATIM_SPEC.fakeTestCards
    .map(
      (c) =>
        `<option value="${esc(c.pan)}">${esc(c.pan)} — ${esc(c.label)}</option>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${order.language}" dir="${t.dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(t.title)}</title>
  <style>
    :root { --bg:#0b1120; --card:#111827; --text:#f9fafb; --muted:#9ca3af; --accent:#2563eb; --border:#1f2937; }
    body { margin:0; font-family:system-ui, -apple-system, sans-serif; background:var(--bg); color:var(--text); min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px; }
    .card { width:100%; max-width:460px; background:var(--card); border:1px solid var(--border); border-radius:14px; padding:24px; }
    .badge { display:inline-block; font-size:12px; padding:4px 10px; border-radius:999px; background:#7c2d12; color:#ffedd5; margin-bottom:12px; }
    h1 { font-size:19px; margin:0 0 16px; }
    .row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); font-size:14px; }
    label { display:block; margin:16px 0 6px; font-size:13px; color:var(--muted); }
    select, input { width:100%; box-sizing:border-box; padding:10px; border-radius:8px; border:1px solid var(--border); background:#030712; color:var(--text); }
    .actions { display:flex; gap:10px; margin-top:18px; }
    button { flex:1; padding:11px; border:none; border-radius:8px; font-weight:600; cursor:pointer; }
    .primary { background:var(--accent); color:#fff; }
    .secondary { background:#374151; color:#f9fafb; }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">${esc(t.badge)}</span>
    <h1>${esc(t.title)}</h1>
    <div class="row"><span>${esc(t.order)}</span><code>${esc(order.orderNumber)}</code></div>
    <div class="row"><span>${esc(t.amount)}</span><strong>${order.amount} (${dzd} DZD)</strong></div>

    <form method="POST" action="/pay/satim/${encodeURIComponent(order.orderId)}/action">
      <label for="cardPan">${esc(t.card)}</label>
      <select id="cardPan" name="cardPan">
        ${cardsHtml}
      </select>
      <div class="actions">
        <button class="primary" type="submit" name="action" value="pay">${esc(t.submit)}</button>
        <button class="secondary" type="submit" name="action" value="user_cancelled">${esc(t.cancel)}</button>
      </div>
    </form>
  </main>
</body>
</html>`;
}
