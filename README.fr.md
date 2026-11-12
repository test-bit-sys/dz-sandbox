# dz-sandbox

**Testez ce qui échoue, pas seulement ce qui réussit.**

Un sandbox local déterministe et 100 % hors ligne simulant les API algériennes de paiement et de livraison (**Chargily Pay v2**, **SATIM**, **Yalidine**) afin d'intégrer et de tester les parcours nominaux *et* les pannes sans compte marchand, identifiants réels ni connexion Internet.

**Langues :** [English](./README.md) | [العربية](./README.ar.md) | Français

> **Avertissement (Disclaimer) :** Non officiel. Non affilié à Chargily, SATIM ou Yalidine. Le comportement est simulé et peut différer de la production. Testez toujours sur le véritable sandbox du fournisseur avant la mise en production. Consultez [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md) pour le détail vérifié vs non vérifié.

---

## Démarrage rapide (une commande)

```bash
docker compose up
```

Ou directement avec Node.js 20+ :

```bash
npm install
npm run build
npx dz-sandbox start
```

| Service | URL par défaut | Rôle |
| --- | --- | --- |
| API de contrôle & Dashboard (AR RTL par défaut) | `http://127.0.0.1:4000` | Interface web, OpenAPI (`/__control/openapi.json`), scénarios, horloge virtuelle, journal webhooks |
| Mock Chargily Pay v2 *(SDK officiel vérifié)* | `http://127.0.0.1:4001/api/v2` | Checkouts, clients, produits, prix, liens de paiement, webhooks signés HMAC-SHA256, page locale |
| Mock SATIM *(spécification non vérifiée)* | `http://127.0.0.1:4002/payment/rest` | Enregistrement -> page cartes factices -> confirmation -> remboursement |
| Mock Yalidine *(géo complet / enveloppes partielles)* | `http://127.0.0.1:4003/v1` | Colis CRUD, validation 69 wilayas / 1 541 communes, tarifs, cycle de vie via horloge virtuelle |

> **Démonstration :** Lancez `./scripts/demo.ps1` (Windows) ou `./scripts/demo.sh` (Linux/macOS), ou suivez le storyboard [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md).

---

## Tester une panne en 15 lignes

```ts
import { sandbox } from '@dz-sandbox/client';

await sandbox.reset();
await sandbox.scenario('chargily', 'duplicate_webhook');
// Créez et validez un checkout sur http://127.0.0.1:4001/api/v2 ...
const hooks = await sandbox.waitForWebhook({ provider: 'chargily', count: 2, timeoutMs: 5000 });
// Vérifiez l'idempotence : la commande ne doit être validée qu'une seule fois !
await sandbox.clock.advance('2h'); // Avance instantanément l'horloge virtuelle
```

Un client Python sans dépendance externe est inclus (`packages/python-client`) :

```python
from dz_sandbox import SandboxClient
client = SandboxClient("http://127.0.0.1:4000")
client.reset()
client.scenario("chargily", "duplicate_webhook")
hooks = client.wait_for_webhook(provider="chargily", count=2)
```

---

## État des spécifications par fournisseur

| Fournisseur | Package | Maturité | Périmètre vérifié vs simulé | Configuration |
| --- | --- | --- | --- | --- |
| **Chargily Pay v2** | `@dz-sandbox/mock-chargily` | **Verified / Partial** | Clients/produits/prix/checkouts et signature HMAC-SHA256 vérifiés de bout en bout avec `@chargily/chargily-pay@2.1.0` ; frais et certains codes 4xx simulés | [chargily.spec.ts](./packages/mock-chargily/src/chargily.spec.ts) |
| **SATIM** | `@dz-sandbox/mock-satim` | **Unverified** | Flux register -> cartes factices (`4000000000000001`..`05`) -> confirm/refund ; chemins bancaires, `jsonParams` et codes d'erreur à confirmer via PDF officiel | [satim.spec.ts](./packages/mock-satim/src/satim.spec.ts) |
| **Yalidine Express** | `@dz-sandbox/mock-yalidine` | **Partial / Unverified** | 69 wilayas (`era: 48\|58\|69`) & 1 541 communes (AR/FR/EN, coordonnées exclues) importées depuis `algeria-geo` ; 9 centres et en-têtes 429 en attente de captures réelles | [yalidine.spec.ts](./packages/mock-yalidine/src/yalidine.spec.ts) |
| **ZR Express** | `@dz-sandbox/mock-zrexpress` | **Scaffold (Non vérifié)** | Squelette de package et scénarios prêts ; renvoie `501 NOT_IMPLEMENTED_AWAITING_SPEC` en attente de documentation officielle ou de captures nettoyées | [zrexpress.spec.ts](./packages/mock-zrexpress/src/zrexpress.spec.ts) |
| **Maystro Delivery** | `@dz-sandbox/mock-maystro` | **Scaffold (Non vérifié)** | Squelette de package et scénarios prêts ; renvoie `501 NOT_IMPLEMENTED_AWAITING_SPEC` en attente de documentation officielle ou de captures nettoyées | [maystro.spec.ts](./packages/mock-maystro/src/maystro.spec.ts) |

Registre complet d'honnêteté : [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md).

---

## Utilisation du SDK officiel `@chargily/chargily-pay`

```ts
import { ChargilyClient } from '@chargily/chargily-pay';
import { pointChargilyClientToSandbox } from '@dz-sandbox/client';

const client = pointChargilyClientToSandbox(
  new ChargilyClient({ api_key: 'test_sk_local', mode: 'test' }),
  process.env.CHARGILY_BASE_URL ?? 'http://127.0.0.1:4001/api/v2',
);
```

---

## CLI, scénarios & documentation

```bash
npx dz-sandbox doctor                         # Vérifie Node, Docker, ports 4000-4003 et génère le .env
npx dz-sandbox scenario set chargily declined # Active le scénario de carte refusée
npx dz-sandbox logs --provider yalidine       # Inspecte les requêtes avec secrets masqués
npx dz-sandbox export repro.json              # Exporte état + scénarios pour reproduire un bug
npx dz-sandbox import repro.json              # Rejoue exactement un rapport d'incident
npx dz-sandbox record --provider yalidine --upstream https://api.yalidine.app/v1 --out ./fixtures/yalidine/captured
npx dz-sandbox fixtures validate ./fixtures   # Vérifie l'absence de secrets/PII non masqués
npx dz-sandbox generate --openapi ./spec.yaml --name custom-courier # Générateur expérimental OpenAPI
```

- **27 scénarios intégrés** (paiement, réseau, webhooks, livraison) — voir [docs/scenarios.md](./docs/scenarios.md).
- Scénarios YAML personnalisés rechargés à chaud depuis `./scenarios/*.yaml`.
- Stockage **mémoire** (`DZ_STORE=memory`) ou **SQLite** (`DZ_STORE=sqlite`) compatible Node 20+.
- **Docs statiques hors ligne & E2E :** `npm run docs:build && npm run test:docs` (`dist-docs/`), `npm run test:e2e:browser` (Chromium Playwright).
- **Exemples exécutables :** [examples/express-checkout](./examples/express-checkout) (handler naïf vs idempotent), [examples/nextjs-cod-store](./examples/nextjs-cod-store), [examples/test-with-vitest](./examples/test-with-vitest) via `npm run examples:smoke`.
- Voir aussi : [docs/THREAT_MODEL.md](./docs/THREAT_MODEL.md) · [docs/CONTRIBUTING-FIXTURES.md](./docs/CONTRIBUTING-FIXTURES.md) · [9 guides d'erreurs courantes](./docs/guides/common-integration-bugs.md) · [docs/VERIFICATION.md](./docs/VERIFICATION.md) · [docs/CAPTURE_GUIDE.md](./docs/CAPTURE_GUIDE.md) · [CHANGELOG.md](./CHANGELOG.md) · [Licence MIT](./LICENSE)
