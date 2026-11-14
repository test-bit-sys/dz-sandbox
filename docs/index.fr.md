# Documentation Officielle dz-sandbox (Français)

**Testez ce qui échoue, pas seulement ce qui réussit.**

Un simulateur local déterministe et **100% hors ligne** reproduisant les passerelles de paiement, les services bancaires mobiles et les APIs de livraison en Algérie :
- **Chargily Pay v2** (cartes Edahabia & CIB, checkouts, webhooks signés HMAC-SHA256)
- **SATIM E-Payment** (passerelle interbancaire nationale SmartVista)
- **Yalidine Express** (CRUD colis sur 69 wilayas et 1 541 communes, cycle de vie COD)
- **BaridiMob Banking** (Algérie Poste mobile banking : connexion, OTP SMS, virements RIP à RIP, solde et cartes)

---

## URLs et Ports Locaux par Défaut

| Service | URL par défaut | Rôle |
| --- | --- | --- |
| **API de Contrôle & Dashboard** | `http://127.0.0.1:4000` | Dashboard web (Arabe RTL par défaut, FR/EN) avec flux direct (Live Stream), horloge virtuelle et sélecteur de scénario |
| **Mock Chargily Pay v2** | `http://127.0.0.1:4001/api/v2` | Checkouts, clients, produits, prix, page de paiement hébergée locale et webhooks |
| **Mock SATIM E-Payment** | `http://127.0.0.1:4002/payment/rest` | Enregistrement (`register.do`), fausses cartes (`4000000000000001`..`05`), confirmation et remboursements |
| **Mock Yalidine Express** | `http://127.0.0.1:4003/v1` | CRUD colis, calcul des frais et cycle de livraison via horloge virtuelle |
| **Mock BaridiMob Banking** | `http://127.0.0.1:4004/mobilebank/service` | Connexion, validation SMS OTP, virements RIP à RIP et paiement de factures |

---

## Démarrage Rapide en 3 Commandes

```bash
# Option 1 : Via npx directement
npx dz-sandbox start

# Option 2 : Via Docker Compose
docker compose up
```

Une fois démarré, ouvrez le dashboard dans votre navigateur :
`http://127.0.0.1:4000`

---

## Testez les Scénarios d'Échec dans Votre Code

### 1) Avec TypeScript / JavaScript
```ts
import { createSandboxClient } from '@dz-sandbox/client';

const sandbox = createSandboxClient({ controlUrl: 'http://127.0.0.1:4000' });

// 1. Réinitialisation
await sandbox.reset();

// 2. Simuler un envoi de webhook en double
await sandbox.scenario('chargily', 'duplicate_webhook');

// 3. Vérifier que la commande n'est validée qu'une seule fois
const hooks = await sandbox.waitForWebhook({ provider: 'chargily', count: 2 });
```

### 2) Avec PHP / Laravel / Pest
```php
use DzSandbox\SandboxClient;

$sandbox = new SandboxClient('http://127.0.0.1:4000');
$sandbox->reset();

// Simuler l'expiration du SMS OTP BaridiMob
$sandbox->scenario('baridimob', 'otp_timeout');
```

### 3) Avec Python
```python
from dz_sandbox import SandboxClient

sandbox = SandboxClient("http://127.0.0.1:4000")
sandbox.reset()
sandbox.scenario("satim", "declined")
```

---

## Pour les Agents IA (Cursor / Windsurf / Claude Code)

Vous développez avec un assistant de codage IA ? Le dépôt comprend des fichiers prêts à l'emploi :
- **`llms.txt`** : Résumé structuré au format standard `llms.txt`.
- **`.cursorrules`** : Règles configurées pour Cursor AI.
- **`skills/dz-sandbox/SKILL.md`** : Définition de compétence pour agents autonomes.

---

## Guides Clés et Sections

- [Statut des Spécifications (SPEC_STATUS)](./SPEC_STATUS.md) — Ce qui est vérifié versus simulé.
- [Catalogue des Scénarios (33 scénarios)](./scenarios.md) — Rejets de carte, pannes réseau, OTP et retours colis.
- [9 Erreurs d'Intégration Fréquentes](./guides/common-integration-bugs.md) — Guides reproductibles pour les webhooks en double et les erreurs DZD/centimes.
- [Guide d'Enregistrement (CAPTURE_GUIDE)](./CAPTURE_GUIDE.md) — Enregistrement et masquage des secrets via `dz-sandbox record`.
- [Contribuer des Fixtures](./CONTRIBUTING-FIXTURES.md) — Liste de contrôle obligatoire avant soumission.
- [Modèle de Menaces (THREAT_MODEL)](./THREAT_MODEL.md) — Politique SSRF et sécurité du plan de contrôle.
- [Ajouter un Fournisseur](./adding-a-provider.md) — Création de nouveaux squelettes de passerelles et transporteurs.
