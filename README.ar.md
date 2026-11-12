# dz-sandbox

**اختبر ما يفشل، لا ما ينجح فقط.**

بيئة محلية حتمية تعمل دون إنترنت لمحاكاة بوابات الدفع والتوصيل الجزائرية (**Chargily Pay v2**، **SATIM**، **Yalidine**) حتى يتمكن المطورون من اختبار مسارات الدفع والتوصيل وحالات الفشل محلياً بدون حساب تاجر أو مفاتيح حقيقية أو اتصال بالإنترنت.

**اللغات:** [English](./README.md) | العربية | [Français](./README.fr.md)

> **إخلاء مسؤولية (Disclaimer):** مشروع غير رسمي ولا يتبع لـ Chargily أو SATIM أو Yalidine. السلوك مُحاكى وقد يختلف عن بيئة الإنتاج. اختبر دائماً على بيئة التجربة الرسمية (Real Sandbox) قبل الإطلاق الفعلي. راجع [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md) لمعرفة التفاصيل المؤكدة مقابل غير المؤكدة.

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

| الخدمة | المنفذ الافتراضي | الوظيفة |
| --- | --- | --- |
| لوحة التحكم وواجهة التحكم (عربية RTL افتراضياً) | `http://127.0.0.1:4000` | واجهة ويب، توثيق OpenAPI، السيناريوهات، الساعة الافتراضية، سجل الـ Webhooks |
| محاكي Chargily Pay v2 | `http://127.0.0.1:4001/api/v2` | Checkout، العملاء، المنتجات، الأسعار، روابط الدفع، توقيع HMAC، صفحة الدفع المحلية |
| محاكي SATIM *(غير مؤكد رسمياً بعد)* | `http://127.0.0.1:4002/payment/rest` | تسجيل الطلب -> بطاقات اختبار وهمية -> تأكيد الدفع -> الاسترجاع |
| محاكي Yalidine *(بيانات جغرافية جزئية)* | `http://127.0.0.1:4003/v1` | الطرود، التحقق من الولاية/البلدية/الهاتف، تسعيرة التوصيل، دورة حياة الشحنة |

---

## اختبار الأخطاء في 15 سطراً

```ts
import { sandbox } from '@dz-sandbox/client';

await sandbox.reset();
await sandbox.scenario('chargily', 'duplicate_webhook');
// أنشئ عملية دفع وأكملها محلياً عبر http://127.0.0.1:4001/api/v2 ...
const hooks = await sandbox.waitForWebhook({ provider: 'chargily', count: 2, timeoutMs: 5000 });
// تأكد أن خادمك يعالج الطلب مرة واحدة فقط (Idempotency) رغم وصول الـ Webhook مرتين!
await sandbox.clock.advance('2h'); // تقديم الساعة الافتراضية فوراً لاختبار التأخير ودورة التوصيل
```

---

## حالة دعم المزودين وصدق التوثيق

| المزود | الحزمة | حالة التحقق | ما تم التحقق منه مقابل ما هو مُحاكى | ملف الإعدادات |
| --- | --- | --- | --- | --- |
| **Chargily Pay v2** | `@dz-sandbox/mock-chargily` | **Verified / Partial** | المسارات وبنية البيانات وتوقيع `signature` HMAC-SHA256 مؤكدة من `@chargily/chargily-pay@2.1.0`؛ معادلة الرسوم وبعض أخطاء 4xx جزئية | [chargily.spec.ts](./packages/mock-chargily/src/chargily.spec.ts) |
| **SATIM** | `@dz-sandbox/mock-satim` | **Unverified** | تدفق التسجيل -> صفحة البطاقات الوهمية (`4000000000000001`..`05`) -> التأكيد/الاسترجاع؛ الأكواد التفصيلية تنتظر الدليل الرسمي للبنك | [satim.spec.ts](./packages/mock-satim/src/satim.spec.ts) |
| **Yalidine Express** | `@dz-sandbox/mock-yalidine` | **Partial / Unverified** | إنشاء وتتبع الطرود + مجموعة ولايات مؤكدة جزئياً (8 ولايات، 19 بلدية، 9 مكاتب Stopdesk)؛ القائمة الكاملة بانتظار `algeria-geo` | [yalidine.spec.ts](./packages/mock-yalidine/src/yalidine.spec.ts) |

---

## أوامر سطر الأوامر (CLI) والمزايا الرئيسية

```bash
dz-sandbox doctor                          # فحص البيئة والمنافذ وتوليد إعدادات .env
dz-sandbox scenario set chargily declined  # تفعيل سيناريو رفض الدفع
dz-sandbox logs --provider yalidine        # عرض الطلبات مع إخفاء المفاتيح الحساسة
dz-sandbox export repro.json               # تصدير حالة وسيناريوهات لمشاركة نفس الخطأ
```

- **27 سيناريو مدمج** لأعطال الدفع والشبكة والـ Webhooks والتوصيل — راجع [docs/scenarios.md](./docs/scenarios.md).
- دعم ملفات YAML المخصصة في `./scenarios` مع إعادة التحميل الفوري.
- لوحة تحكم تدعم **العربية (RTL افتراضياً) والفرنسية والإنجليزية** مع الوضع الليلي والنهاري دون خطوط أو موارد خارجية.
