import { SATIM_SPEC, type SatimOutcome } from './satim.spec.js';

export type SatimLifecycleState =
  | 'REGISTERED'
  | 'PAID'
  | 'DECLINED'
  | 'CANCELLED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export interface SatimOrder {
  orderId: string;
  orderNumber: string;
  userName: string;
  amount: number; // centimes
  depositAmount: number;
  refundedAmount: number;
  currency: string;
  returnUrl: string;
  failUrl: string;
  description: string;
  language: 'ar' | 'fr' | 'en';
  jsonParams: Record<string, unknown>;
  state: SatimLifecycleState;
  orderStatus: number;
  errorCode: number;
  actionCode: number;
  actionCodeDescription: string;
  approvalCode: string | null;
  maskedPan: string | null;
  formUrl: string;
  createdAt: string;
  updatedAt: string;
}

export class SatimTransitionError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'SatimTransitionError';
  }
}

export function applyPaymentOutcome(
  order: SatimOrder,
  outcome: SatimOutcome,
  nowIso: string,
  maskedPan = '400000******0001',
  approvalCode = '000001',
): SatimOrder {
  if (order.state !== 'REGISTERED') {
    throw new SatimTransitionError(
      SATIM_SPEC.errorCodes.invalidOrderId,
      `Cannot process payment for order in state ${order.state}`,
    );
  }

  if (outcome === 'success') {
    return {
      ...order,
      state: 'PAID',
      orderStatus: SATIM_SPEC.orderStatus.paid,
      errorCode: SATIM_SPEC.errorCodes.success,
      actionCode: SATIM_SPEC.actionCodes.approved,
      actionCodeDescription: 'Approved (simulated)',
      depositAmount: order.amount,
      approvalCode,
      maskedPan,
      updatedAt: nowIso,
    };
  }

  if (outcome === 'user_cancelled') {
    return {
      ...order,
      state: 'CANCELLED',
      orderStatus: SATIM_SPEC.orderStatus.cancelled,
      errorCode: SATIM_SPEC.errorCodes.success,
      actionCode: SATIM_SPEC.actionCodes.cancelledByUser,
      actionCodeDescription: 'Cancelled by cardholder (simulated)',
      maskedPan,
      updatedAt: nowIso,
    };
  }

  const actionCodeMap: Record<Exclude<SatimOutcome, 'success' | 'user_cancelled'>, [number, string]> = {
    declined: [SATIM_SPEC.actionCodes.declined, 'Transaction declined by issuer (simulated)'],
    insufficient_funds: [SATIM_SPEC.actionCodes.insufficientFunds, 'Insufficient funds (simulated)'],
    expired_card: [SATIM_SPEC.actionCodes.expiredCard, 'Expired card (simulated)'],
    '3ds_timeout': [SATIM_SPEC.actionCodes.threeDsTimeout, '3DS authentication timeout (simulated)'],
  };

  const [actionCode, desc] = actionCodeMap[outcome];
  return {
    ...order,
    state: 'DECLINED',
    orderStatus: SATIM_SPEC.orderStatus.declined,
    errorCode: SATIM_SPEC.errorCodes.success,
    actionCode,
    actionCodeDescription: desc,
    maskedPan,
    updatedAt: nowIso,
  };
}

export function applyRefund(
  order: SatimOrder,
  refundAmount: number,
  nowIso: string,
): SatimOrder {
  if (order.state !== 'PAID' && order.state !== 'PARTIALLY_REFUNDED') {
    throw new SatimTransitionError(
      SATIM_SPEC.errorCodes.invalidOrderId,
      `Illegal refund transition from state ${order.state}`,
    );
  }
  if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
    throw new SatimTransitionError(
      SATIM_SPEC.errorCodes.missingParameter,
      'Refund amount must be a positive integer in centimes',
    );
  }
  const remaining = order.depositAmount - order.refundedAmount;
  if (refundAmount > remaining) {
    throw new SatimTransitionError(
      SATIM_SPEC.errorCodes.systemError,
      `Refund amount ${refundAmount} exceeds remaining refundable amount ${remaining}`,
    );
  }

  const totalRefunded = order.refundedAmount + refundAmount;
  const isFull = totalRefunded >= order.depositAmount;
  return {
    ...order,
    refundedAmount: totalRefunded,
    state: isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    orderStatus: isFull ? SATIM_SPEC.orderStatus.refunded : SATIM_SPEC.orderStatus.paid,
    errorCode: SATIM_SPEC.errorCodes.success,
    updatedAt: nowIso,
  };
}
