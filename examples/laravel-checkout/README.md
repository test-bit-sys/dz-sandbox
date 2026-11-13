# Laravel 11+ Algerian Checkout Integration (Chargily, SATIM, Yalidine)

دليل تكامل شامل لربط تطبيقات **Laravel** مع بوابات الدفع والشحن الجزائرية (**Chargily Pay v2**، **SATIM CIB / Edahabia**، و **Yalidine Express**) محلياً بدون إنترنت وباستخدام **dz-sandbox**.

---

## ⚡ Quick Start / البداية السريعة

### 1. تشغيل بيئة المحاكاة المحلية (Start dz-sandbox)

```bash
# In your terminal
npx dz-sandbox start
```

### 2. إعداد المتغيرات في ملف `.env` (Laravel Environment)

أضف هذه المتغيرات إلى ملف `.env` الخاص بمشروع Laravel:

```dotenv
# Chargily Pay v2 Local Sandbox
CHARGILY_BASE_URL=http://127.0.0.1:4001/api/v2
CHARGILY_PUBLIC_KEY=test_pk_dz_sandbox
CHARGILY_SECRET_KEY=test_sk_dz_sandbox_chargily_secret

# SATIM CIB / Edahabia Local Sandbox
SATIM_BASE_URL=http://127.0.0.1:4002/payment/rest
SATIM_USERNAME=test_merchant
SATIM_PASSWORD=test_password
SATIM_TERMINAL_ID=E010901001

# Yalidine Express Local Sandbox
YALIDINE_BASE_URL=http://127.0.0.1:4003/v1
YALIDINE_API_ID=test_api_id
YALIDINE_API_TOKEN=test_api_token
```

### 3. تمرير الـ Webhooks محلياً (Forward Webhooks to Laravel)

عند تشغيل خادم Laravel (`php artisan serve` على المنفذ `8000`)، يمكنك توجيه إشعارات الدفع (Webhooks) لحظياً ومباشرة إلى خادمك المحلي باستخدام الأمر:

```bash
npx dz-sandbox listen --forward-to http://127.0.0.1:8000/api/webhooks/chargily --provider chargily
```

ستشاهد في التيرمينال كل حدث دفع يتم إرساله والتحقق من توقيع HMAC فوريًا:

```
> Ready! Forwarding webhooks from http://127.0.0.1:4000 -> http://127.0.0.1:8000/api/webhooks/chargily
[14:15:22] [chargily] checkout.paid -> http://127.0.0.1:8000/api/webhooks/chargily [HTTP 200] (14ms)
```

---

## 📁 بنية الملفات (File Structure)

- `config/dz_sandbox.php`: إعدادات الروابط والمفاتيح للبوابات الثلاث.
- `app/Services/ChargilyPayService.php`:
  - إنشاء جلسات دفع (Checkouts).
  - التحقق الصارم من توقيع الـ Webhook عبر `hash_equals` و `hash_hmac('sha256', ...)`.
- `app/Services/SatimPaymentService.php`:
  - تسجيل طلبات الدفع عبر `register.do`.
  - تأكيد المعاملات عبر `confirmOrder.do`.
- `app/Services/YalidineDeliveryService.php`:
  - جلب بيانات الولايات والبلديات (Wilayas & Communes).
  - إنشاء وتتبع الطرود وإرسال الشحنات (Parcels).
- `app/Http/Controllers/ChargilyWebhookController.php`: معالجة أحداث الـ Webhooks بأمان.
- `app/Http/Controllers/CheckoutController.php`: توجيه المستخدم لصفحات الدفع واستقبال العودة.

---

## 🧪 اختبار السيناريوهات المعقدة (Testing Scenarios)

يمكنك اختبار الحالات الشاذة ومحاكاة المشاكل قبل إطلاق موقعك:

```bash
# محاكاة رفض الدفع لبطاقة شارجيلي
npx dz-sandbox scenario set chargily declined

# محاكاة إرسال الـ Webhook مرتين متتاليتين لاختبار الـ Idempotency
npx dz-sandbox scenario set chargily duplicate_webhook

# محاكاة تأخر شبكة ساتيم
npx dz-sandbox scenario set satim network_timeout

# إعادة الوضع الافتراضي
npx dz-sandbox reset
```
