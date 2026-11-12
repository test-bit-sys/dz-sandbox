# dz-sandbox

**اختبر ما يفشل، لا ما ينجح فقط.**

بيئة محلية حتمية تعمل دون إنترنت لمحاكاة واجهات الدفع والتوصيل الجزائرية (**Chargily Pay v2**، **SATIM**، **Yalidine**) حتى يتمكن المطورون من اختبار مسارات الدفع والتوصيل وحالات الفشل محلياً بدون حساب تاجر أو مفاتيح حقيقية أو اتصال بالإنترنت.

**اللغات:** [English](./README.md) | العربية | [Français (French)](./README.fr.md)

> **إخلاء مسؤولية (Disclaimer):** مشروع غير رسمي ولا يتبع لـ Chargily أو SATIM أو Yalidine. السلوك مُحاكى وقد يختلف عن بيئة الإنتاج. اختبر دائماً على البيئة التجريبية الرسمية (Real Sandbox) قبل الإطلاق الفعلي. راجع [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md) لمعرفة ما تم التحقق منه مقابل غير المؤكد.

---

## التشغيل السريع بأمر واحد

```bash
docker compose up
```

أو مباشرة عبر Node.js 20+:

```bash
npm install
npm run build
npx dz-sandbox start
```

| الخدمة | العنوان الافتراضي | الوظيفة |
| --- | --- | --- |
| لوحة التحكم وواجهة التحكم (عربية RTL افتراضياً) | `http://127.0.0.1:4000` | واجهة ويب، توثيق OpenAPI (`/__control/openapi.json`)، السيناريوهات، الساعة الافتراضية، سجل الـ Webhooks |
| محاكي Chargily Pay v2 *(متوافق مع الحزمة الرسمية)* | `http://127.0.0.1:4001/api/v2` | Checkouts، العملاء، المنتجات، الأسعار، روابط الدفع، توقيع HMAC-SHA256، صفحة الدفع المحلية |
| محاكي SATIM *(مواصفات غير مؤكدة رسمياً)* | `http://127.0.0.1:4002/payment/rest` | تسجيل الطلب -> صفحة بطاقات اختبار وهمية -> تأكيد الدفع -> الاسترجاع |
| محاكي Yalidine *(بيانات ولايات كاملة / استجابات جزئية)* | `http://127.0.0.1:4003/v1` | الطرود، التحقق من 69 ولاية و1,541 بلدية، تسعيرة التوصيل، دورة حياة الشحنة بالساعة الافتراضية |

> **تجربة عملية سريعة:** شغّل `./scripts/demo.ps1` (على Windows) أو `./scripts/demo.sh` (على Linux/macOS)، أو راجع سيناريو العرض [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md).

---

## اختبار الأعطال في 15 سطراً

```ts
import { sandbox } from '@dz-sandbox/client';

await sandbox.reset();
await sandbox.scenario('chargily', 'duplicate_webhook');
// أنشئ عملية دفع وأكملها محلياً عبر http://127.0.0.1:4001/api/v2 ...
const hooks = await sandbox.waitForWebhook({ provider: 'chargily', count: 2, timeoutMs: 5000 });
// تأكد أن خادمك يعالج الطلب مرة واحدة فقط (Idempotency) رغم وصول الـ Webhook مرتين!
await sandbox.clock.advance('2h'); // تقديم الساعة الافتراضية فوراً لاختبار التأخير ودورة التوصيل
```

عميل Python متاح أيضاً بدون أي مكتبات خارجية (`packages/python-client`):

```python
from dz_sandbox import SandboxClient
client = SandboxClient("http://127.0.0.1:4000")
client.reset()
client.scenario("chargily", "duplicate_webhook")
hooks = client.wait_for_webhook(provider="chargily", count=2)
```

---

## حالة دعم المزودين وجدول الصدق

| المزود | الحزمة | حالة التحقق | النطاق المؤكد مقابل المُحاكى | الإعدادات والمواصفات |
| --- | --- | --- | --- | --- |
| **Chargily Pay v2** | `@dz-sandbox/mock-chargily` | **Verified / Partial** | مسارات العملاء/المنتجات/الأسعار/الـ Checkout وتوقيع HMAC-SHA256 مؤكدة عبر الحزمة الرسمية `@chargily/chargily-pay@2.1.0`؛ معادلة الرسوم وبعض أخطاء 4xx مُحاكاة | [chargily.spec.ts](./packages/mock-chargily/src/chargily.spec.ts) |
| **SATIM** | `@dz-sandbox/mock-satim` | **Unverified** | تدفق التسجيل -> صفحة البطاقات الوهمية (`4000000000000001`..`05`) -> التأكيد/الاسترجاع؛ المسارات البنكية والأكواد التفصيلية تنتظر الدليل الرسمي | [satim.spec.ts](./packages/mock-satim/src/satim.spec.ts) |
| **Yalidine Express** | `@dz-sandbox/mock-yalidine` | **Partial / Unverified** | استيراد 69 ولاية (`era: 48\|58\|69`) و1,541 بلدية (AR/FR/EN دون الإحداثيات) من `algeria-geo`؛ 9 مكاتب Stopdesk وترويسات المعدل تنتظر عينات حقيقية | [yalidine.spec.ts](./packages/mock-yalidine/src/yalidine.spec.ts) |
| **ZR Express** | `@dz-sandbox/mock-zrexpress` | **هيكل أولي (غير مؤكد)** | هيكل الحزمة ومحرك السيناريوهات جاهزان؛ يرجع `501 NOT_IMPLEMENTED_AWAITING_SPEC` حتى توفر وثائق رسمية أو عينات حقيقية منقحة | [zrexpress.spec.ts](./packages/mock-zrexpress/src/zrexpress.spec.ts) |
| **Maystro Delivery** | `@dz-sandbox/mock-maystro` | **هيكل أولي (غير مؤكد)** | هيكل الحزمة ومحرك السيناريوهات جاهزان؛ يرجع `501 NOT_IMPLEMENTED_AWAITING_SPEC` حتى توفر وثائق رسمية أو عينات حقيقية منقحة | [maystro.spec.ts](./packages/mock-maystro/src/maystro.spec.ts) |

السجل الكامل لحالة المواصفات: [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md).

---

## الربط مع الحزمة الرسمية `@chargily/chargily-pay`

```ts
import { ChargilyClient } from '@chargily/chargily-pay';
import { pointChargilyClientToSandbox } from '@dz-sandbox/client';

const client = pointChargilyClientToSandbox(
  new ChargilyClient({ api_key: 'test_sk_local', mode: 'test' }),
  process.env.CHARGILY_BASE_URL ?? 'http://127.0.0.1:4001/api/v2',
);
```

---

## سطر الأوامر والمزايا والوثائق

```bash
npx dz-sandbox doctor                         # فحص Node و Docker والمنافذ 4000-4003 وطباعة .env
npx dz-sandbox scenario set chargily declined # تفعيل سيناريو رفض الدفع
npx dz-sandbox logs --provider yalidine       # عرض الطلبات مع إخفاء المفاتيح الحساسة
npx dz-sandbox export repro.json              # تصدير الحالة والسيناريوهات لمشاركة نفس الخطأ
npx dz-sandbox import repro.json              # إعادة تشغيل نفس التقرير محلياً
npx dz-sandbox record --provider yalidine --upstream https://api.yalidine.app/v1 --out ./fixtures/yalidine/captured
npx dz-sandbox fixtures validate ./fixtures   # التحقق من خلو البيانات من المفاتيح الحساسة أو PII
npx dz-sandbox generate --openapi ./spec.yaml --name custom-courier # توليد مزود تجريبي من OpenAPI
```

- **27 سيناريو مدمج** لأعطال الدفع والشبكة والـ Webhooks والتوصيل — راجع [docs/scenarios.md](./docs/scenarios.md).
- دعم ملفات YAML المخصصة في `./scenarios/*.yaml` مع إعادة التحميل الفوري.
- لوحة تحكم تدعم **العربية (RTL افتراضياً) والفرنسية والإنجليزية**، وتخزين بالذاكرة (`DZ_STORE=memory`) أو SQLite (`DZ_STORE=sqlite`).
- **توثيق ثابت يعمل دون إنترنت واختبار متصفح E2E:** `npm run docs:build && npm run test:docs` (`dist-docs/`)، `npm run test:e2e:browser`.
- **الأمثلة القابلة للتشغيل:** [examples/express-checkout](./examples/express-checkout) (يعرض خطأ تكرار الـ Webhook مقابل الحل السليم)، و [examples/nextjs-cod-store](./examples/nextjs-cod-store)، و [examples/test-with-vitest](./examples/test-with-vitest) عبر الأمر `npm run examples:smoke`.
- راجع أيضاً: [docs/THREAT_MODEL.md](./docs/THREAT_MODEL.md) · [docs/CONTRIBUTING-FIXTURES.md](./docs/CONTRIBUTING-FIXTURES.md) · [أدلة أخطاء التكامل الشائعة (9)](./docs/guides/common-integration-bugs.md) · [docs/VERIFICATION.md](./docs/VERIFICATION.md) · [docs/CAPTURE_GUIDE.md](./docs/CAPTURE_GUIDE.md) · [CHANGELOG.md](./CHANGELOG.md) · [MIT License](./LICENSE)
