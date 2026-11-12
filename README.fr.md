# dz-sandbox

**Testez ce qui échoue, pas seulement ce qui réussit.**

Un sandbox local déterministe et 100 % hors ligne simulant les API algériennes de paiement et de livraison (**Chargily Pay v2**, **SATIM**, **Yalidine**), permettant d'intégrer et de tester les cas nominaux *et* les pannes sans compte marchand, identifiants réels ni connexion Internet.

**Langues :** [English](./README.md) | [العربية](./README.ar.md) | Français

> **Avertissement (Disclaimer) :** Non officiel. Non affilié à Chargily, SATIM ou Yalidine. Le comportement est simulé et peut différer de la production. Testez toujours sur le véritable sandbox du fournisseur avant la mise en production. Consultez [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md).

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
| API de contrôle & Dashboard | `http://127.0.0.1:4000` | Interface web (AR RTL/FR/EN), OpenAPI, scénarios, horloge virtuelle, journal webhooks |
| Mock Chargily Pay v2 | `http://127.0.0.1:4001/api/v2` | Checkouts, clients, produits, prix, liens de paiement, webhooks signés HMAC |
| Mock SATIM *(non vérifié)* | `http://127.0.0.1:4002/payment/rest` | Enregistrement -> page cartes factices -> retour -> confirmation -> remboursement |
| Mock Yalidine *(jeu géo partiel)* | `http://127.0.0.1:4003/v1` | Colis, validation wilaya/commune/téléphone, tarifs, historique par horloge virtuelle |

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

---

## État des spécifications par fournisseur

| Fournisseur | Package | Maturité | Détails vérifiés vs simulés | Configuration |
| --- | --- | --- | --- | --- |
| **Chargily Pay v2** | `@dz-sandbox/mock-chargily` | **Verified / Partial** | Endpoints, schémas et signature HMAC-SHA256 vérifiés via `@chargily/chargily-pay@2.1.0` | [chargily.spec.ts](./packages/mock-chargily/src/chargily.spec.ts) |
| **SATIM** | `@dz-sandbox/mock-satim` | **Unverified** | Flux register -> cartes factices (`4000000000000001`..`05`) -> confirm/refund ; codes bancaires à confirmer via PDF officiel | [satim.spec.ts](./packages/mock-satim/src/satim.spec.ts) |
| **Yalidine Express** | `@dz-sandbox/mock-yalidine` | **Partial / Unverified** | CRUD colis & cycle de vie + sous-ensemble vérifié (8 wilayas, 19 communes, 9 stopdesks) ; jeu complet en attente d'`algeria-geo` | [yalidine.spec.ts](./packages/mock-yalidine/src/yalidine.spec.ts) |

---

## CLI & Fonctionnalités clés

```bash
dz-sandbox doctor                         # Vérifie Node, Docker, ports 4000-4003 et génère le .env
dz-sandbox scenario set chargily declined # Active le scénario de carte refusée
dz-sandbox logs --provider yalidine       # Inspecte les requêtes avec secrets masqués
dz-sandbox export repro.json              # Exporte état + scénarios pour reproduire un bug
```

- **27 scénarios intégrés** (paiement, réseau, webhooks, livraison) — voir [docs/scenarios.md](./docs/scenarios.md).
- Scénarios YAML personnalisés rechargés à chaud depuis `./scenarios`.
- Stockage **mémoire** (`DZ_STORE=memory`) ou **SQLite** (`DZ_STORE=sqlite`).
