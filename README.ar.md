# dz-sandbox

<div dir="rtl">

**اختبر ما يفشل، لا ما ينجح فقط.**

بيئة محاكاة محلية، حتمية وتعمل بالكامل **دون إنترنت** لبوابات الدفع والتوصيل في الجزائر (**Chargily Pay v2**، **SATIM**، **Yalidine**) لتمكين المطورين من اختبار مسارات النجاح وسيناريوهات الأعطال الحقيقية محلياً دون الحاجة إلى حسابات تجارية، أو بطاقات حقيقية، أو اتصال بالإنترنت.

</div>

[![CI](https://github.com/[OWNER]/dz-sandbox/actions/workflows/ci.yml/badge.svg)](https://github.com/[OWNER]/dz-sandbox/actions/workflows/ci.yml)
[![الترخيص: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![الحالة: محاكي غير رسمي](https://img.shields.io/badge/status-unofficial_simulator-orange.svg)](#إخلاء-مسؤولية)

**اللغات:** [English](./README.md) | **العربية** | [Français](./README.fr.md)

<!-- TODO: تسجيل وإضافة docs/assets/demo.gif (راجع docs/DEMO_SCRIPT.md) -->

> ### إخلاء مسؤولية
> **مشروع غير رسمي.** ليس تابعاً لشركات Chargily أو SATIM أو Yalidine. السلوك يحاكي المنطق البرمجي وقد يختلف عن بيئة الإنتاج الحقيقية. احرص دائماً على الاختبار ضد بيئات الاختبار الرسمية قبل الإطلاق النهائي. راجع [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md) لتفاصيل ما تم التحقق منه وما زال قيد المحاكاة.

---

<div dir="rtl">

## التشغيل السريع في 3 أوامر

### الخيار 1: عبر Docker Compose
</div>

```bash
docker compose up
```

<div dir="rtl">

### الخيار 2: عبر Node.js (20+)
</div>

```bash
npm install
npm run build
npx dz-sandbox start
```

<div dir="rtl">

### الروابط المحلية للخدمات
</div>

| الخدمة | الرابط الافتراضي | الوظيفة |
| --- | --- | --- |
| **واجهة التحكم ولوحة البيانات** | `http://127.0.0.1:4000` | لوحة تحكم باللغة العربية (RTL افتراضياً) مع دعم الإنجليزية والفرنسية، مخطط OpenAPI، ساعة افتراضية، ومبدل السيناريوهات |
| **محاكي Chargily Pay v2** | `http://127.0.0.1:4001/api/v2` | عمليات الدفع، العملاء، المنتجات، الأسعار، روابط الدفع، صفحة الدفع المستضافة محلياً، وwebhooks موقعة بـ HMAC-SHA256 |
| **محاكي SATIM للدفع الإلكتروني** | `http://127.0.0.1:4002/payment/rest` | تسجيل العملية (`register.do`)، صفحة إدخال البطاقات التجريبية (`4000000000000001`..`05`)، التأكيد، والاسترجاع المالي المقيد |
| **محاكي Yalidine للتوصيل** | `http://127.0.0.1:4003/v1` | إدارة الطرود، حساب تكاليف التوصيل، 69 ولاية و1,541 بلدية، وتتبع دورة حياة الطرود عبر الساعة الافتراضية |

<div dir="rtl">

### توجيه الحزمة الرسمية `@chargily/chargily-pay` إلى المحاكي المحلي
</div>

```ts
import { ChargilyClient } from '@chargily/chargily-pay';
import { pointChargilyClientToSandbox } from '@dz-sandbox/client';

const client = pointChargilyClientToSandbox(
  new ChargilyClient({ api_key: 'test_sk_local', mode: 'test' }),
  process.env.CHARGILY_BASE_URL ?? 'http://127.0.0.1:4001/api/v2',
);
```

---

<div dir="rtl">

## اختبر ما يفشل في 15 سطراً برمجياً

معظم عمليات التكامل تختبر فقط حالة الدفع الناجح. مع `dz-sandbox`، يمكنك اختبار الأعطال الحقيقية بشكل حتمي:
</div>

```ts
import { createSandboxClient } from '@dz-sandbox/client';

const sandbox = createSandboxClient({ controlUrl: 'http://127.0.0.1:4000' });

// 1. إعادة ضبط الحالة إلى نقطة البداية
await sandbox.reset();

// 2. تفعيل سيناريو تكرار إرسال الـ webhook
await sandbox.scenario('chargily', 'duplicate_webhook');

// 3. إنشاء وإتمام عملية دفع تجريبية ...
// 4. انتظار وصول الإشعارين والتأكد من معالجة الطلب مرة واحدة فقط (Idempotency)
const webhooks = await sandbox.waitForWebhook({ provider: 'chargily', count: 2, timeoutMs: 5000 });

// 5. تقديم الساعة الافتراضية لتفعيل أحداث التوصيل المؤجلة دون انتظار حقيقي
await sandbox.clock.advance('2h');
```

<div dir="rtl">

يتوفر أيضاً عميل Python خفيف دون أي مكتبات خارجية (`packages/python-client`):
</div>

```python
from dz_sandbox import SandboxClient

client = SandboxClient("http://127.0.0.1:4000")
client.reset()
client.scenario("chargily", "duplicate_webhook")
hooks = client.wait_for_webhook(provider="chargily", count=2)
```

---

<div dir="rtl">

## لماذا dz-sandbox؟

### المشكلة في بيئات التطوير الحالية
- **صعوبة الحصول على حسابات تجريبية:** قد يتطلب فتح حساب تاجر تجريبي لدى البوابات الجزائرية أسابيع من الإجراءات الإدارية.
- **أخطاء الإنتاج غير المكتشفة:** العديد من المتاجر الإلكترونية تقع في أخطاء تكرار شحن الطلب عند وصول الإشعار مرتين، أو تعطل النظام بسبب وصول الإشعارات بترتيب غير صحيح، أو الخلط بين مبالغ الدينار والسنتيم (خصم `25` دج بدلاً من `2500` دج في SATIM).
- **الحاجة لبيئة تعمل دون إنترنت:** الاختبار السريع داخل بيئات CI المغلقة أو أثناء التنقل مستحيل عند الاعتماد على خوادم خارجية.

### ما الذي يقدمه هذا المشروع؟
- **محرك سيناريوهات حتمي:** قواعد واضحة للأولوية: ترويسة الطلب (`X-DZ-Scenario`) > قاعدة المورد المحدد > قواعد التسلسل > الافتراضي للبوابة > `success`.
- **ساعة افتراضية للتحكم في الزمن:** تقديم الوقت (`+2h` أو `+1d`) لاختبار إعادة محاولات الـ webhooks ودورات حياة الطرود متعددة الأيام لحظياً.
- **يعمل دون إنترنت بنسبة 100%:** لا اتصالات خارجية، لا أدوات تتبع، ولا اعتمادات على شبكات CDN.
- **لوحة تحكم عربية بالكامل (RTL):** واجهة ويب مدمجة وخفيفة تدعم العربية كلغة افتراضية مع الفرنسية والإنجليزية.
- **تسجيل وإعادة تشغيل آمنة:** أداة مدمجة (`dz-sandbox record`) تقوم بإخفاء المفاتيح الحساسة وبيانات العملاء الشخصية تلقائياً قبل حفظ العينات.

</div>

---

<div dir="rtl">

## حالة المواصفات ومستوى التحقق

كل مسار في `dz-sandbox` يخضع للتوثيق المكتوب في [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md). لا نبتكر مسارات غير مؤكدة دون توضيح ذلك بصدق.
</div>

| المزود | الحزمة | الجاهزية | نطاق التحقق والمحاكاة | ملف الإعدادات |
| --- | --- | --- | --- | --- |
| **Chargily Pay v2** | `@dz-sandbox/mock-chargily` | **مؤكد / جزئي** | دورة حياة العملاء والمنتجات والدفع وتوقيع HMAC-SHA256 مؤكدة مع الحزمة الرسمية `@chargily/chargily-pay@2.1.0`. صيغة الرسوم وبعض أخطاء 4xx تحت المحاكاة | [chargily.spec.ts](./packages/mock-chargily/src/chargily.spec.ts) |
| **SATIM للدفع** | `@dz-sandbox/mock-satim` | **غير مؤكد (محاكاة)** | تسجيل العملية، صفحة البطاقات الوهمية (`4000000000000001`..`05`)، التأكيد والاسترجاع. المسارات الدقيقة للبنوك تتطلب الكتيب التقني الرسمي | [satim.spec.ts](./packages/mock-satim/src/satim.spec.ts) |
| **Yalidine للتوصيل** | `@dz-sandbox/mock-yalidine` | **جزئي / غير مؤكد** | 69 ولاية و1,541 بلدية مستوردة من الجريدة الرسمية. إنشاء وتحديث الطرود وحساب الرسوم تحت المحاكاة؛ بانتظار عينات حقيقية | [yalidine.spec.ts](./packages/mock-yalidine/src/yalidine.spec.ts) |
| **ZR Express** | `@dz-sandbox/mock-zrexpress` | **هيكل أولي** | الحزمة جاهزة وترجع `501 NOT_IMPLEMENTED_AWAITING_SPEC` حتى تتوفر وثائق رسمية أو عينات مسجلة ومنقحة | [zrexpress.spec.ts](./packages/mock-zrexpress/src/zrexpress.spec.ts) |
| **Maystro Delivery** | `@dz-sandbox/mock-maystro` | **هيكل أولي** | الحزمة جاهزة وترجع `501 NOT_IMPLEMENTED_AWAITING_SPEC` حتى تتوفر وثائق رسمية أو عينات مسجلة ومنقحة | [maystro.spec.ts](./packages/mock-maystro/src/maystro.spec.ts) |

<div dir="rtl">

السجل الكامل للتحقق: [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md)

</div>

---

<div dir="rtl">

## سيناريوهات الأعطال المدمجة (27 سيناريو)

يمكن التبديل الفوري بين السيناريوهات عبر الترويسة (`X-DZ-Scenario: <name>`) أو لوحة التحكم أو سطر الأوامر أو عميل الاختبار:
</div>

| التصنيف | أمثلة | الغرض |
| --- | --- | --- |
| **أعطال الدفع** | `declined`, `insufficient_funds`, `expired_card`, `invalid_card`, `amount_mismatch` | اختبار معالجة الواجهة لرفض البطاقات، ونقص الرصيد، واختلاف العملة |
| **الشبكة والبوابة** | `timeout`, `network_drop`, `gateway_500`, `rate_limited` | اختبار مرونة النظام في حالات الانقطاع، والبطء، وتجاوز حدود الطلبات (`429`) |
| **إشعارات الـ Webhooks** | `duplicate_webhook`, `delayed_webhook`, `out_of_order_webhooks`, `webhook_bad_signature`, `webhook_never_sent` | اختبار معالجة الطلبات المتكررة، والتأكد من رفض التوقيعات المزورة |
| **دورة حياة التوصيل** | `lifecycle_fast`, `status_stuck`, `delivery_failed`, `returned_to_sender`, `phone_rejected`, `invalid_wilaya` | اختبار إشعارات التتبع، وتوقف الطرود، والتحقق من صحة الولاية والبلدية ورقم الهاتف |

<div dir="rtl">

دليل السيناريوهات الكامل: [docs/scenarios.md](./docs/scenarios.md)

</div>

---

<div dir="rtl">

## لوحة التحكم وسطر الأوامر (CLI)

<!-- TODO: إضافة لقطة شاشة للوحة التحكم docs/assets/dashboard.png -->

لوحة التحكم متاحة محلياً عبر `http://127.0.0.1:4000`:
- **عربية بالكامل (RTL افتراضياً):** تبديل سلس وفوري بين العربية والفرنسية والإنجليزية.
- **مصفوفة السيناريوهات:** فحص التغطية التجريبية لجميع السيناريوهات الـ 27 لكل مزود.
- **مفتش الطلبات وإشعارات الـ Webhooks:** مراقبة فورية للترويسات والبيانات مع إخفاء المفاتيح الحساسة.
- **معاينة الدفع المستضاف:** إتمام عمليات الدفع الوهمية مباشرة من خلال إطار مضمن (iframe).

### أوامر CLI
</div>

```bash
npx dz-sandbox doctor                         # فحص بيئة التشغيل والمنافذ وتوليد إعدادات .env
npx dz-sandbox start                          # تشغيل الخوادم ولوحة التحكم
npx dz-sandbox stop                           # إيقاف الخوادم
npx dz-sandbox status                         # عرض حالة الخدمات والسيناريوهات النشطة
npx dz-sandbox reset                          # إعادة ضبط البيانات والساعة الافتراضية
npx dz-sandbox scenario set chargily declined # تفعيل سيناريو رفض الدفع
npx dz-sandbox logs --provider chargily       # عرض سجل الطلبات مع إخفاء الأسرار
npx dz-sandbox export repro.json              # تصدير حالة المحاكي لإعادة إنتاج مشكلة برمجية
npx dz-sandbox import repro.json              # استيراد حزمة حالة وتشغيلها محلياً
npx dz-sandbox record --provider yalidine --upstream https://api.yalidine.app/v1 --out ./fixtures/yalidine/captured
npx dz-sandbox replay --provider yalidine --fixtures ./fixtures/yalidine/captured
npx dz-sandbox fixtures validate ./fixtures   # التأكد من خلو العينات من البيانات الحساسة
npx dz-sandbox generate --openapi ./spec.yaml --name custom-courier # توليد تجريبي لمزود جديد من OpenAPI
```

---

<div dir="rtl">

## 9 أدلة لأشهر أخطاء التكامل وحلولها

أدلة مفصلة تشرح أسباب وأعراض وطرق إصلاح أشهر الأعطال في بوابات الدفع والتوصيل في الجزائر:

1. [إشعارات الـ Webhook المكررة وشحن الطلب مرتين](./docs/guides/bugs/01-duplicate-webhooks.md) (`duplicate_webhook`)
2. [وصول إشعارات الـ Webhook بترتيب غير متسلسل](./docs/guides/bugs/02-out-of-order-webhooks.md) (`out_of_order_webhooks`)
3. [إهمال التحقق من التوقيع الرقمي للـ Webhook](./docs/guides/bugs/03-missing-signature-verification.md) (`webhook_bad_signature`)
4. [معالجة الطلبات غير المعزولة والتسابق المتزامن](./docs/guides/bugs/04-non-idempotent-fulfillment.md) (`delayed_webhook`)
5. [انقطاع الاتصال دون إعادة المحاولة أو مفتاح Idempotency](./docs/guides/bugs/05-timeout-without-retry.md) (`timeout`, `gateway_500`)
6. [الخلط بين وحدات الدينار والسنتيم](./docs/guides/bugs/06-amount-units-dzd-vs-centimes.md) (`amount_mismatch`)
7. [تكرار الخصم عند تحديث المتصفح أو زر الرجوع](./docs/guides/bugs/07-double-charge-on-refresh.md) (`double_charge_attempt`)
8. [تعلق حالة الطرد والتكرار اللانهائي للاستعلام](./docs/guides/bugs/08-parcel-stuck-states.md) (`status_stuck`, `lifecycle_fast`)
9. [أسماء الولايات والبلديات غير المطابقة وتنسيقات الهواتف](./docs/guides/bugs/09-invalid-wilaya-commune.md) (`invalid_wilaya`, `phone_rejected`)

الفهرس الكامل للأدلة: [docs/guides/common-integration-bugs.md](./docs/guides/common-integration-bugs.md)

---

## المساهمة في المشروع

نرحب بمساهمات الجميع! وأفضل طريقة للمساهمة لا تتطلب بالضرورة كتابة كود:
- **المساهمة بعينات مسجلة ومنقحة:** سجل تبادلات HTTP حقيقية في بيئات الاختبار باستخدام `dz-sandbox record`، احذف البيانات الحساسة، تأكد عبر `dz-sandbox fixtures validate` وافتح Pull Request. راجع [docs/CAPTURE_GUIDE.md](./docs/CAPTURE_GUIDE.md) و[docs/CONTRIBUTING-FIXTURES.md](./docs/CONTRIBUTING-FIXTURES.md).
- **الإبلاغ عن أي اختلاف في السلوك:** إذا لاحظت اختلافاً بين المحاكي وبيئة الاختبار الحقيقية، افتح [تقرير خطأ](https://github.com/[OWNER]/dz-sandbox/issues/new?template=bug_report.yml).
- **التطوير وإضافة السيناريوهات:** راجع [CONTRIBUTING.md](./CONTRIBUTING.md) و[docs/adding-a-provider.md](./docs/adding-a-provider.md).

---

## الأمان والخصوصية

- يربط المحاكي الخوادم تلقائياً بـ `127.0.0.1` ويطلب رمز حماية `DZ_CONTROL_TOKEN` في حال ربطه بشبكة خارجية.
- حماية مشددة ضد ثغرات SSRF على النطاقات الخاصة وعناوين بيانات التعريف السحابية.
- إخفاء آلي وتلقائي للمفاتيح وكلمات المرور وبيانات البطاقات داخل سجلات الطلبات.
- للإبلاغ عن الثغرات الأمنية بطريقة سرية، راجع [SECURITY.md](./SECURITY.md) و[docs/THREAT_MODEL.md](./docs/THREAT_MODEL.md).

## الترخيص

مرخص تحت رخصة MIT &copy; 2026 [YOUR NAME] ومساهمي dz-sandbox. راجع [LICENSE](./LICENSE).

</div>
