/**
 * STATUS: UNVERIFIED (flag: unverified)
 *
 * All SATIM endpoint names, error codes, action codes, order statuses, and test card
 * mappings live in this single configurable file so they can be updated cleanly once
 * verified against an official SATIM / Acquiring Bank Technical Integration Guide PDF.
 */
export const SATIM_SPEC = {
  verified: false as const,
  currencyDzd: '012',
  endpoints: {
    register: ['register.do'],
    confirm: ['confirmOrder.do', 'acknowledgeTransaction.do', 'getOrderStatusExtended.do'],
    refund: ['refund.do'],
  },
  orderStatus: {
    registered: 0,
    preAuthorized: 1,
    paid: 2,
    cancelled: 3,
    refunded: 4,
    declined: 6,
  },
  errorCodes: {
    success: 0,
    duplicateOrder: 1,
    unknownCurrency: 3,
    missingParameter: 4,
    accessDenied: 5,
    invalidOrderId: 6,
    systemError: 7,
  },
  actionCodes: {
    approved: 0,
    declined: 100,
    insufficientFunds: 116,
    expiredCard: 101,
    cancelledByUser: 119,
    threeDsTimeout: 120,
    refundRejected: 200,
  },
  /** Clearly fake test card numbers mapped to simulated outcomes (not real PANs) */
  fakeTestCards: [
    {
      pan: '4000000000000001',
      masked: '400000******0001',
      label: 'Test CIB/Edahabia - Approved',
      outcome: 'success',
    },
    {
      pan: '4000000000000002',
      masked: '400000******0002',
      label: 'Test Card - Declined',
      outcome: 'declined',
    },
    {
      pan: '4000000000000003',
      masked: '400000******0003',
      label: 'Test Card - Insufficient Funds',
      outcome: 'insufficient_funds',
    },
    {
      pan: '4000000000000004',
      masked: '400000******0004',
      label: 'Test Card - Expired',
      outcome: 'expired_card',
    },
    {
      pan: '4000000000000005',
      masked: '400000******0005',
      label: 'Test Card - 3DS Timeout',
      outcome: '3ds_timeout',
    },
  ],
} as const;

export type SatimOutcome =
  | 'success'
  | 'declined'
  | 'insufficient_funds'
  | 'expired_card'
  | 'user_cancelled'
  | '3ds_timeout';
