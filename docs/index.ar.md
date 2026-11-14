# توثيق dz-sandbox الرسمي (العربية - RTL)

**اختبر ما يفشل، لا ما ينجح فقط.**

بيئة محاكاة محلية، حتمية وتعمل بالكامل **دون اتصال بالإنترنت** (100% Offline) لبوابات الدفع الإلكتروني، وتطبيقات الخدمات البنكية، وشركات التوصيل في الجزائر:
- **Chargily Pay v2** (البطاقة الذهبية و CIB)
- **SATIM** (بوابة الدفع البنكية الوطنية)
- **Yalidine Express** (إدارة وطرود وتوصيل 69 ولاية و1,541 بلدية)
- **BaridiMob** (الخدمات البنكية لبريد الجزائر: تحويلات RIP، تأكيد OTP، والبطاقات الذهبية)

---

## المنافذ والروابط المحلية للخدمات

| الخدمة | الرابط الافتراضي | الوظيفة الأساسية |
| --- | --- | --- |
| **واجهة التحكم ولوحة البيانات** | `http://127.0.0.1:4000` | لوحة تحكم باللغة العربية مع دعم البث المباشر (Live Stream)، وساعة افتراضية، ومبدل سيناريوهات الأعطال |
| **محاكي Chargily Pay v2** | `http://127.0.0.1:4001/api/v2` | عمليات الدفع، العملاء، روابط الدفع، صفحة الدفع المستضافة محلياً، وwebhooks موقعة بـ HMAC-SHA256 |
| **محاكي SATIM للدفع الإلكتروني** | `http://127.0.0.1:4002/payment/rest` | تسجيل العملية (`register.do`)، صفحة إدخال البطاقات التجريبية، التأكيد، والاسترجاع المالي |
| **محاكي Yalidine للتوصيل** | `http://127.0.0.1:4003/v1` | إدارة وتتبع الطرود، حساب تكاليف الشحن، وتتبع دورة حياة الطرود عبر الساعة الافتراضية |
| **محاكي بريدي موب (BaridiMob)** | `http://127.0.0.1:4004/mobilebank/service` | خدمات بريد الجزائر: تسجيل الدخول، تأكيد SMS OTP، تحويلات RIP، والبطاقات الذهبية |

---

## التشغيل السريع في 3 أوامر

```bash
# الخيار 1: عبر npx مباشرة
npx dz-sandbox start

# الخيار 2: عبر Docker Compose
docker compose up
```

بعد التشغيل، افتح لوحة التحكم مباشرة عبر المتصفح:
`http://127.0.0.1:4000`

---

## اختبر الأعطال في شفرتك البرمجية

### 1) مع TypeScript / JavaScript
```ts
import { createSandboxClient } from '@dz-sandbox/client';

const sandbox = createSandboxClient({ controlUrl: 'http://127.0.0.1:4000' });

// 1. إعادة ضبط الحالة
await sandbox.reset();

// 2. تفعيل سيناريو إرسال إشعار مكرر لاختبار الـ Idempotency
await sandbox.scenario('chargily', 'duplicate_webhook');

// 3. انتظار وصول الإشعارين والتأكد من عدم شحن الطلب مرتين
const hooks = await sandbox.waitForWebhook({ provider: 'chargily', count: 2 });
```

### 2) مع PHP / Laravel / Pest
```php
use DzSandbox\SandboxClient;

$sandbox = new SandboxClient('http://127.0.0.1:4000');
$sandbox->reset();

// محاكاة انتهاء صلاحية كود الـ SMS OTP في بريدي موب
$sandbox->scenario('baridimob', 'otp_timeout');
```

### 3) مع Python
```python
from dz_sandbox import SandboxClient

sandbox = SandboxClient("http://127.0.0.1:4000")
sandbox.reset()
sandbox.scenario("satim", "declined")
```

---

## دعم وكلاء البرمجة والذكاء الاصطناعي (AI Coding Agents)

إذا كنت تستخدم Cursor أو Claude Code أو Windsurf، يتضمن المشروع ملفات جاهزة:
- **ملف `llms.txt`**: مواصفات مختصرة يفهمها الـ LLM تلقائياً.
- **ملف `.cursorrules`**: تعليمات لمحرر Cursor لتوجيهه لاستخدام المحاكي المحلي.
- **المهارة `skills/dz-sandbox/SKILL.md`**: تعريف قياسي لوكلاء الذكاء الاصطناعي.

---

## الأدلة الإرشادية والروابط الأساسية

- [جدول صدق المواصفات (SPEC_STATUS)](./SPEC_STATUS.md) — توثيق دقيق لما تم التحقق منه وما زال تحت المحاكاة.
- [كتالوج السيناريوهات (33 سيناريو)](./scenarios.md) — قائمة سيناريوهات الأعطال الكاملة (رفض البطاقات، انقطاع الشبكة، الـ OTP، والطرود المرتجعة).
- [أشهر 9 أخطاء تكامل في الجزائر وكيفية تفاديها](./guides/common-integration-bugs.md) — أدلة وحلول لأخطاء الـ Webhooks المتكررة ومشاكل السنتيم مقابل الدينار.
- [دليل التسجيل وإزالة الأسرار (CAPTURE_GUIDE)](./CAPTURE_GUIDE.md) — تسجيل عينات حقيقية عبر `dz-sandbox record`.
- [المساهمة ببيانات وعينات (CONTRIBUTING-FIXTURES)](./CONTRIBUTING-FIXTURES.md) — المساهمة وتوسيع نطاق المزودين.
- [نموذج التهديدات الأمنية (THREAT_MODEL)](./THREAT_MODEL.md) — أمان الـ Webhooks وعزل الشبكة المحلية.
