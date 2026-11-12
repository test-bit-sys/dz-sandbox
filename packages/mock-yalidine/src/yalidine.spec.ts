/**
 * Configurable Yalidine Express API v1 specification constants.
 * Endpoints and auth headers partially verified from public docs (https://api.yalidine.app/v1/);
 * exact error envelopes, status IDs, and webhook support are unverified and isolated here.
 */
export const YALIDINE_SPEC = {
  authHeaders: {
    apiId: 'x-api-id',
    apiToken: 'x-api-token',
  },
  /** Unverified exact numeric status IDs; French status labels follow common Yalidine tracking labels */
  statuses: {
    pending: { id: 1, label: 'En préparation' },
    shipped: { id: 2, label: 'Expédié' },
    outForDelivery: { id: 3, label: 'En livraison' },
    failedAttempt: { id: 4, label: 'Tentative échouée' },
    delivered: { id: 5, label: 'Livré' },
    returned: { id: 6, label: 'Retour à l\'expéditeur' },
  },
  /** Algerian phone format validation: 05/06/07 + 8 digits (or +2135/6/7 + 8 digits) */
  phoneRegex: /^(?:0[567]\d{8}|\+213[567]\d{8})$/,
  /** Unverified: whether Yalidine v1 emits webhooks natively (off unless target URL configured) */
  defaultWebhookEvent: 'parcel.status_updated',
} as const;
