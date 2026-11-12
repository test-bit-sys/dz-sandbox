/**
 * Configurable Chargily Pay v2 specification constants.
 * Verified against @chargily/chargily-pay v2.1.0 & https://dev.chargily.com/pay-v2/.
 * Anything marked unverified in docs/SPEC_STATUS.md can be adjusted here.
 */
export const CHARGILY_SPEC = {
  /** Verified: signature header name from @chargily/chargily-pay lib/utils/index.js */
  webhookSignatureHeader: 'signature',
  /** Verified: HMAC-SHA256 hex digest over raw JSON body */
  webhookAlgorithm: 'sha256' as const,
  /** Default test secret used when signing webhooks if client did not provide a custom Bearer key */
  defaultSecretKey: 'test_sk_dz_sandbox_chargily_secret',
  /**
   * Unverified exact webhook event type names beyond checkout.paid/failed/canceled/expired.
   * Configurable here for easy alignment with live sandbox captures.
   */
  events: {
    checkoutPaid: 'checkout.paid',
    checkoutFailed: 'checkout.failed',
    checkoutCanceled: 'checkout.canceled',
    checkoutExpired: 'checkout.expired',
  },
  /** Unverified fee formula: simulated 0 DZD or 1.5% + 0 for DZD test mode */
  computeFees(amount: number): number {
    return Math.round(amount * 0.015);
  },
};

export interface ChargilyWallet {
  currency: string;
  balance: number;
  ready_for_payout: number;
  on_hold: number;
}

export interface ChargilyCustomer {
  id: string;
  entity: 'customer';
  livemode: false;
  name: string;
  email: string | null;
  phone: string | null;
  address: { country: string; state: string; address: string } | null;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ChargilyProduct {
  id: string;
  entity: 'product';
  livemode: false;
  name: string;
  description: string | null;
  images: string[];
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ChargilyPrice {
  id: string;
  entity: 'price';
  livemode: false;
  amount: number;
  currency: string;
  product_id: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ChargilyCheckoutItem {
  id: string;
  entity: 'price';
  amount: number;
  quantity: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  created_at: number;
  updated_at: number;
  product_id: string;
}

export type ChargilyCheckoutStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'canceled' | 'expired';

export interface ChargilyCheckout {
  id: string;
  entity: 'checkout';
  livemode: false;
  amount: number;
  currency: string;
  fees: number;
  pass_fees_to_customer: boolean;
  status: ChargilyCheckoutStatus;
  locale: 'ar' | 'en' | 'fr';
  description: string;
  success_url: string;
  failure_url: string;
  webhook_endpoint: string;
  payment_method: string | null;
  invoice_id: string | null;
  customer_id: string | null;
  payment_link_id: string | null;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  shipping_address: { country: string; state: string; address: string } | null;
  collect_shipping_address: boolean;
  checkout_url: string;
  /** Internal sandbox tracking fields (stripped from public API responses if needed or kept minimal) */
  _items?: ChargilyCheckoutItem[];
  _secret_key?: string;
}

export interface ChargilyPaymentLinkItem {
  id: string;
  entity: 'price';
  amount: number;
  quantity: number;
  adjustable_quantity: boolean;
  currency: string;
  metadata: Record<string, unknown> | null;
  created_at: number;
  updated_at: number;
  product_id: string;
}

export interface ChargilyPaymentLink {
  id: string;
  entity: 'payment_link';
  livemode: false;
  name: string;
  active: boolean;
  after_completion_message: string;
  locale: 'ar' | 'en' | 'fr';
  pass_fees_to_customer: boolean;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  collect_shipping_address: boolean;
  url: string;
  _items?: ChargilyPaymentLinkItem[];
}
