# Contributing to dz-sandbox

Thank you for helping Algerian developers **test what fails, not just what succeeds**!
شكراً لمساهمتك في مساعدة المطورين الجزائريين على اختبار برمجياتهم محلياً وبثقة تامة.

---

## مرحباً بالمطورين الجزائريين (Welcome Algerian Developers) 🇩🇿

مشروع **dz-sandbox** مفتوح للجميع ومصمم خصيصاً لحل المشاكل اليومية التي يواجهها المطور في الجزائر (بوابات الدفع الوطنية، شركات التوصيل، التطبيقات المالية، والاختبار أوفلاين دون الحاجة لكروت حقيقية أو إنترنت سريع).

سواء كنت طالب، فريلانسر، أو مطور في شركة ناشئة، مساهمتك مرحب بها جداً!

### مهام ممتازة للبدء (Good First Issues):
1. **إضافة مزودي توصيل جدد**: محاكاة استجابات بوابات توصيل محلية مثل (ZR Express، Maystro Delivery، أو Nord & Ouest).
2. **قوالب وأمثلة لمشاريع حقيقية**: إضافة مجلدات أمثلة (Laravel, Next.js, Django, FastAPI, Flutter) توضح كيفية ربط الـ Sandbox في اختبارات الـ CI/CD.
3. **توسيع بيانات الولايات والبلديات (58 ولاية)**: تحسين أرقام التتبع ومراكز التوزيع في Yalidine و BaridiMob.
4. **توثيق وتجارب مطورين**: كتابة تجاربك أو تحسين الدليل الإرشادي والأخطاء الشائعة.

---

## Core Rules

1. **Honesty first — never invent API details.**
   Every endpoint, header, field name, status table, or signature scheme must come from official documentation or real sandbox captures.
   - If you verify an endpoint/payload, add a fixture under `fixtures/<provider>/` with `"verified": true` and a concrete `"source"`, and update `docs/SPEC_STATUS.md`.
   - If something is inferred or partial, keep `"verified": false` and isolate configurable constants inside `packages/mock-<provider>/src/*.spec.ts`.
2. **Never commit real credentials, merchant keys, or real card numbers.** Use clearly fake test values (`test_sk_*`, `4000000000000001`).
3. **Do not copy proprietary docs/code verbatim.** Write original descriptions and schemas from understanding.
4. **Offline-first & minimal dependencies.** Tests and dashboard must run cleanly offline after `npm install`.

---

## How to Add a New Scenario

1. Define the scenario name and metadata in `packages/core/src/scenarios.ts`.
2. Implement its simulated response or fault injection in the respective `packages/mock-<provider>/src/server.ts`.
3. Add a unit test verifying both the default behavior and the scenario activation in `packages/mock-<provider>/src/*.test.ts`.
4. Document the new scenario in `docs/scenarios.md`.

---

## Development Workflow

```bash
# 1. Install dependencies
npm install

# 2. Build monorepo packages
npm run build

# 3. Run typecheck & lint
npm run typecheck
npm run lint

# 4. Run test suites with coverage
npm run test:coverage
npm run test:python
npm run examples:smoke
```

Coverage thresholds (`vitest.config.ts`) require **>=85%** lines/statements/functions and **>=75%** branches globally.

---

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new scenario, endpoint, or provider simulation
- `fix:` bug fix or spec alignment correction
- `test:` unit, contract fixture, property, or E2E test additions
- `docs:` README, guides, or `SPEC_STATUS.md` updates
- `ci:` workflow or Docker updates

Wait for CI checks to pass before requesting review, and summarize any changes to verified vs. unverified spec entries in your PR description.
