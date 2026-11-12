import type { SandboxContext, WebhookDispatcher } from '@dz-sandbox/core';
import { YALIDINE_SPEC } from './yalidine.spec.js';

export interface ParcelHistoryEntry {
  tracking: string;
  status: string;
  status_id: number;
  reason: string;
  center_name: string;
  date: string;
}

export interface YalidineParcel {
  tracking: string;
  order_id: string;
  from_wilaya_id: number;
  from_wilaya_name: string;
  to_wilaya_id: number;
  to_wilaya_name: string;
  to_commune_name: string;
  firstname: string;
  familyname: string;
  contact_phone: string;
  address: string;
  product_list: string;
  price: number;
  freeshipping: boolean;
  is_stopdesk: boolean;
  stopdesk_id: number;
  has_exchange: boolean;
  weight: number;
  status: string;
  last_status: string;
  status_id: number;
  delivery_fee: number;
  created_at: string;
  updated_at: string;
  webhook_url?: string;
}

export const PARCEL_NS = 'yalidine:parcels';
export const HISTORY_NS = 'yalidine:histories';

interface LifecycleStep {
  delayMs: number;
  status: { id: number; label: string };
  reason: string;
  centerName: string;
}

export function getLifecyclePlan(scenarioName: string, destWilayaName: string): LifecycleStep[] {
  if (scenarioName === 'status_stuck') {
    return [];
  }
  if (scenarioName === 'returned_to_sender') {
    return [
      {
        delayMs: 5 * 60_000,
        status: YALIDINE_SPEC.statuses.shipped,
        reason: 'Colis expédié vers le hub de destination',
        centerName: 'Hub Alger',
      },
      {
        delayMs: 10 * 60_000,
        status: YALIDINE_SPEC.statuses.failedAttempt,
        reason: 'Client injoignable',
        centerName: `Agence ${destWilayaName}`,
      },
      {
        delayMs: 15 * 60_000,
        status: YALIDINE_SPEC.statuses.returned,
        reason: 'Colis retourné à l\'expéditeur',
        centerName: 'Hub Alger',
      },
    ];
  }
  if (scenarioName === 'delivery_failed_retry') {
    return [
      {
        delayMs: 5 * 60_000,
        status: YALIDINE_SPEC.statuses.shipped,
        reason: 'Colis expédié',
        centerName: 'Hub Alger',
      },
      {
        delayMs: 10 * 60_000,
        status: YALIDINE_SPEC.statuses.failedAttempt,
        reason: 'Première tentative échouée (client absent)',
        centerName: `Agence ${destWilayaName}`,
      },
      {
        delayMs: 20 * 60_000,
        status: YALIDINE_SPEC.statuses.outForDelivery,
        reason: 'Nouvelle sortie en livraison',
        centerName: `Agence ${destWilayaName}`,
      },
      {
        delayMs: 25 * 60_000,
        status: YALIDINE_SPEC.statuses.delivered,
        reason: 'Livré au destinataire après deuxième tentative',
        centerName: `Agence ${destWilayaName}`,
      },
    ];
  }
  if (scenarioName === 'lifecycle_fast') {
    return [
      {
        delayMs: 5 * 60_000,
        status: YALIDINE_SPEC.statuses.shipped,
        reason: 'Colis pris en charge et expédié',
        centerName: 'Hub Alger',
      },
      {
        delayMs: 10 * 60_000,
        status: YALIDINE_SPEC.statuses.outForDelivery,
        reason: 'En cours de livraison',
        centerName: `Agence ${destWilayaName}`,
      },
      {
        delayMs: 15 * 60_000,
        status: YALIDINE_SPEC.statuses.delivered,
        reason: 'Livré avec succès',
        centerName: `Agence ${destWilayaName}`,
      },
    ];
  }

  // Standard created_ok progression on virtual clock (4h -> 12h -> 24h)
  return [
    {
      delayMs: 4 * 3_600_000,
      status: YALIDINE_SPEC.statuses.shipped,
      reason: 'Colis expédié',
      centerName: 'Hub Alger',
    },
    {
      delayMs: 12 * 3_600_000,
      status: YALIDINE_SPEC.statuses.outForDelivery,
      reason: 'En cours de livraison',
      centerName: `Agence ${destWilayaName}`,
    },
    {
      delayMs: 24 * 3_600_000,
      status: YALIDINE_SPEC.statuses.delivered,
      reason: 'Livré',
      centerName: `Agence ${destWilayaName}`,
    },
  ];
}

export function scheduleParcelLifecycle(
  ctx: SandboxContext,
  webhooks: WebhookDispatcher | undefined,
  parcel: YalidineParcel,
  scenarioName: string,
): void {
  const plan = getLifecyclePlan(scenarioName, parcel.to_wilaya_name);

  for (const step of plan) {
    ctx.clock.schedule(
      step.delayMs,
      async () => {
        const latest = ctx.store.getResource<YalidineParcel>(PARCEL_NS, parcel.tracking);
        if (!latest) return; // Parcel deleted/cancelled before transition

        const nowIso = ctx.clock.isoNow();
        latest.status = step.status.label;
        latest.last_status = step.status.label;
        latest.status_id = step.status.id;
        latest.updated_at = nowIso;
        ctx.store.setResource(PARCEL_NS, latest.tracking, latest);

        const histories =
          ctx.store.getResource<ParcelHistoryEntry[]>(HISTORY_NS, latest.tracking) ?? [];
        histories.push({
          tracking: latest.tracking,
          status: step.status.label,
          status_id: step.status.id,
          reason: step.reason,
          center_name: step.centerName,
          date: nowIso,
        });
        ctx.store.setResource(HISTORY_NS, latest.tracking, histories);

        const targetUrl = latest.webhook_url || process.env.DZ_YALIDINE_WEBHOOK_URL;
        if (webhooks && targetUrl) {
          await webhooks.dispatch({
            provider: 'yalidine',
            eventType: YALIDINE_SPEC.defaultWebhookEvent,
            targetUrl,
            secret: 'test_sk_yalidine_webhook',
            payload: {
              event: YALIDINE_SPEC.defaultWebhookEvent,
              tracking: latest.tracking,
              order_id: latest.order_id,
              status: latest.status,
              status_id: latest.status_id,
              reason: step.reason,
              updated_at: nowIso,
            },
          });
        }
      },
      `yalidine:${parcel.tracking}:${step.status.label}`,
    );
  }
}
