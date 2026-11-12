import formbody from '@fastify/formbody';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  applyNetworkScenario,
  getScenarioHeader,
  registerRequestAuditHook,
  type SandboxContext,
  type WebhookDispatcher,
} from '@dz-sandbox/core';
import {
  CHARGILY_SPEC,
  type ChargilyCheckout,
  type ChargilyCheckoutItem,
  type ChargilyCheckoutStatus,
  type ChargilyCustomer,
  type ChargilyPaymentLink,
  type ChargilyPaymentLinkItem,
  type ChargilyPrice,
  type ChargilyProduct,
  type ChargilyWallet,
} from './chargily.spec.js';
import { renderChargilyHostedPage } from './hosted-page.js';

export interface ChargilyServerDeps {
  ctx: SandboxContext;
  webhooks: WebhookDispatcher;
  publicBaseUrl?: string;
}

const NS = {
  customers: 'chargily:customers',
  products: 'chargily:products',
  prices: 'chargily:prices',
  checkouts: 'chargily:checkouts',
  paymentLinks: 'chargily:payment_links',
  wallets: 'chargily:wallets',
} as const;

const AddressSchema = z.object({
  country: z.string().min(2),
  state: z.string().min(1),
  address: z.string().min(1),
});

const CreateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(3).optional(),
  address: AddressSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(3).optional(),
  address: AddressSchema.partial().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const CreateProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  images: z.array(z.string()).max(8).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  images: z.array(z.string()).max(8).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const CreatePriceSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).transform((c) => c.toLowerCase()),
  product_id: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

const UpdatePriceSchema = z.object({
  metadata: z.record(z.unknown()),
});

const CheckoutItemSchema = z.object({
  price: z.string().min(1),
  quantity: z.number().int().positive(),
});

const CreateCheckoutSchema = z
  .object({
    items: z.array(CheckoutItemSchema).min(1).optional(),
    amount: z.number().positive().optional(),
    currency: z.string().min(3).max(3).transform((c) => c.toLowerCase()).optional(),
    payment_method: z.enum(['edahabia', 'cib']).optional().default('edahabia'),
    success_url: z.string().url(),
    failure_url: z.string().url().optional(),
    webhook_endpoint: z.string().url().optional(),
    description: z.string().optional(),
    locale: z.enum(['ar', 'en', 'fr']).optional().default('ar'),
    pass_fees_to_customer: z.boolean().optional().default(false),
    customer_id: z.string().optional(),
    shipping_address: AddressSchema.optional(),
    collect_shipping_address: z.boolean().optional().default(false),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine(
    (data) => Boolean(data.items?.length) || (data.amount !== undefined && Boolean(data.currency)),
    { message: 'Either items or (amount and currency) must be provided' },
  );

const PaymentLinkItemSchema = z.object({
  price: z.string().min(1),
  quantity: z.number().int().positive(),
  adjustable_quantity: z.boolean().optional().default(false),
});

const CreatePaymentLinkSchema = z.object({
  name: z.string().min(1),
  items: z.array(PaymentLinkItemSchema).min(1),
  after_completion_message: z.string().optional(),
  locale: z.enum(['ar', 'en', 'fr']).optional().default('ar'),
  pass_fees_to_customer: z.boolean().optional().default(false),
  collect_shipping_address: z.boolean().optional().default(false),
  metadata: z.record(z.unknown()).optional(),
});

const UpdatePaymentLinkSchema = CreatePaymentLinkSchema.partial();

function paginate<T>(items: T[], perPageRaw: string | undefined, pageRaw: string | undefined, path: string) {
  const perPage = Math.max(1, Math.min(100, Number.parseInt(perPageRaw ?? '10', 10) || 10));
  const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);
  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const offset = (page - 1) * perPage;
  const data = items.slice(offset, offset + perPage);

  return {
    livemode: false,
    current_page: page,
    data,
    first_page_url: `${path}?page=1`,
    last_page: lastPage,
    last_page_url: `${path}?page=${lastPage}`,
    next_page_url: page < lastPage ? `${path}?page=${page + 1}` : null,
    path,
    per_page: perPage,
    prev_page_url: page > 1 ? `${path}?page=${page - 1}` : null,
    total,
  };
}

function extractBearerToken(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (!auth) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1]?.trim();
}

function publicCheckoutView(checkout: ChargilyCheckout): Omit<ChargilyCheckout, '_items' | '_secret_key'> {
  const { _items: _i, _secret_key: _s, ...rest } = checkout;
  return rest;
}

function publicPaymentLinkView(link: ChargilyPaymentLink): Omit<ChargilyPaymentLink, '_items'> {
  const { _items: _i, ...rest } = link;
  return rest;
}

export function createChargilyServer(deps: ChargilyServerDeps): FastifyInstance {
  const { ctx, webhooks } = deps;
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  app.register(formbody);
  registerRequestAuditHook(app, ctx, 'chargily');

  const baseUrlFromRequest = (request: FastifyRequest): string => {
    if (deps.publicBaseUrl) return deps.publicBaseUrl.replace(/\/$/, '');
    const host = request.headers.host ?? `127.0.0.1:${process.env.DZ_CHARGILY_PORT ?? '4001'}`;
    return `http://${host}`;
  };

  const epochSec = (): number => Math.floor(ctx.clock.now() / 1000);

  const ensureDzdWallet = (): ChargilyWallet => {
    const existing = ctx.store.getResource<ChargilyWallet>(NS.wallets, 'dzd');
    if (existing) return existing;
    const initial: ChargilyWallet = {
      currency: 'dzd',
      balance: 0,
      ready_for_payout: 0,
      on_hold: 0,
    };
    ctx.store.setResource(NS.wallets, 'dzd', initial);
    return initial;
  };

  async function guardRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    resourceId?: string,
  ): Promise<{ token: string; scenarioName: string } | undefined> {
    const resolved = ctx.scenarios.resolve({
      provider: 'chargily',
      headerScenario: getScenarioHeader(request),
      resourceId,
    });
    (request as FastifyRequest & { _dzScenario?: string })._dzScenario = resolved.name;

    if (await applyNetworkScenario(ctx, 'chargily', request, reply, resolved)) {
      return undefined;
    }

    const token = extractBearerToken(request);
    if (!token) {
      reply.code(401).send({ message: 'Unauthenticated.' });
      return undefined;
    }
    return { token, scenarioName: resolved.name };
  }

  async function completeCheckoutAction(
    checkoutId: string,
    requestedOutcome?: string,
    headerScenario?: string,
  ): Promise<{ checkout: ChargilyCheckout; outcome: string; httpStatus: number }> {
    const checkout = ctx.store.getResource<ChargilyCheckout>(NS.checkouts, checkoutId);
    if (!checkout) {
      throw Object.assign(new Error('Checkout not found'), { statusCode: 404 });
    }

    const explicitFailureAction =
      requestedOutcome && requestedOutcome !== 'success' ? requestedOutcome : undefined;
    const resolved = ctx.scenarios.resolve({
      provider: 'chargily',
      headerScenario: headerScenario ?? explicitFailureAction,
      resourceId: checkoutId,
    });
    const outcome = explicitFailureAction ?? resolved.definition.behavior.outcome ?? resolved.name;

    if (checkout.status === 'paid' && outcome === 'double_charge_attempt') {
      return { checkout, outcome, httpStatus: 409 };
    }
    if (checkout.status === 'expired') {
      return { checkout, outcome: 'expired', httpStatus: 422 };
    }

    let nextStatus: ChargilyCheckoutStatus = 'paid';
    let eventType: string = CHARGILY_SPEC.events.checkoutPaid;

    if (outcome === 'declined' || outcome === 'insufficient_funds' || outcome === 'expired_card') {
      nextStatus = 'failed';
      eventType = CHARGILY_SPEC.events.checkoutFailed;
    } else if (outcome === 'user_cancelled') {
      nextStatus = 'canceled';
      eventType = CHARGILY_SPEC.events.checkoutCanceled;
    } else if (outcome === 'double_charge_attempt' && checkout.status === 'paid') {
      return { checkout, outcome, httpStatus: 409 };
    }

    checkout.status = nextStatus;
    checkout.updated_at = epochSec();
    ctx.store.setResource(NS.checkouts, checkout.id, checkout);

    if (nextStatus === 'paid') {
      const wallet = ensureDzdWallet();
      wallet.balance += checkout.amount;
      wallet.ready_for_payout += checkout.amount;
      ctx.store.setResource(NS.wallets, 'dzd', wallet);
    }

    if (checkout.webhook_endpoint) {
      const secret = checkout._secret_key ?? CHARGILY_SPEC.defaultSecretKey;
      const whBehavior = resolved.definition.behavior.webhook;

      if (whBehavior?.outOfOrder) {
        await webhooks.dispatchSequence(
          [
            {
              provider: 'chargily',
              eventType: 'checkout.processing',
              targetUrl: checkout.webhook_endpoint,
              secret,
              signatureHeader: CHARGILY_SPEC.webhookSignatureHeader,
              payload: {
                id: ctx.rng.id('evt'),
                entity: 'event',
                livemode: false,
                type: 'checkout.processing',
                data: { ...publicCheckoutView(checkout), status: 'processing' },
                created_at: epochSec(),
                updated_at: epochSec(),
              },
            },
            {
              provider: 'chargily',
              eventType,
              targetUrl: checkout.webhook_endpoint,
              secret,
              signatureHeader: CHARGILY_SPEC.webhookSignatureHeader,
              payload: {
                id: ctx.rng.id('evt'),
                entity: 'event',
                livemode: false,
                type: eventType,
                data: publicCheckoutView(checkout),
                created_at: epochSec(),
                updated_at: epochSec(),
              },
            },
          ],
          true,
        );
      } else {
        await webhooks.dispatch({
          provider: 'chargily',
          eventType,
          targetUrl: checkout.webhook_endpoint,
          secret,
          signatureHeader: CHARGILY_SPEC.webhookSignatureHeader,
          behavior: whBehavior,
          payload: {
            id: ctx.rng.id('evt'),
            entity: 'event',
            livemode: false,
            type: eventType,
            data: publicCheckoutView(checkout),
            created_at: epochSec(),
            updated_at: epochSec(),
          },
        });
      }
    }

    return { checkout, outcome, httpStatus: 200 };
  }

  app.get('/health', async () => ({ status: 'ok', service: 'mock-chargily' }));

  // Hosted payment page + action endpoint
  app.get<{ Params: { id: string } }>('/pay/chargily/:id', async (request, reply) => {
    const checkout = ctx.store.getResource<ChargilyCheckout>(NS.checkouts, request.params.id);
    if (!checkout) {
      return reply.code(404).send({ message: 'Checkout not found' });
    }
    reply.type('text/html; charset=utf-8').send(renderChargilyHostedPage(checkout));
  });

  app.post<{ Params: { id: string }; Body: { action?: string } }>(
    '/pay/chargily/:id/action',
    async (request, reply) => {
      const action = request.body?.action;
      try {
        const result = await completeCheckoutAction(
          request.params.id,
          action,
          getScenarioHeader(request),
        );
        if (result.httpStatus !== 200) {
          return reply.code(result.httpStatus).send({
            error: 'CHECKOUT_CONFLICT',
            checkout: publicCheckoutView(result.checkout),
          });
        }

        const acceptsJson = (request.headers.accept ?? '').includes('application/json');
        const redirectTarget =
          result.checkout.status === 'paid'
            ? result.checkout.success_url
            : result.checkout.failure_url || result.checkout.success_url;

        if (acceptsJson) {
          return {
            ok: true,
            outcome: result.outcome,
            redirect_url: redirectTarget,
            checkout: publicCheckoutView(result.checkout),
          };
        }
        return reply.redirect(redirectTarget);
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode ?? 500;
        return reply.code(code).send({ message: (err as Error).message });
      }
    },
  );

  // Register Chargily v2 API under both /api/v2 and /test/api/v2
  for (const prefix of ['/api/v2', '/test/api/v2']) {
    app.register(
      async (api) => {
        // Balance
        api.get('/balance', async (request, reply) => {
          if (!(await guardRequest(request, reply))) return;
          const dzd = ensureDzdWallet();
          return {
            entity: 'balance',
            livemode: false,
            wallets: [dzd],
          };
        });

        // Customers
        api.post('/customers', async (request, reply) => {
          if (!(await guardRequest(request, reply))) return;
          const parsed = CreateCustomerSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(422).send({ message: 'Validation failed', errors: parsed.error.flatten() });
          }
          const now = epochSec();
          const customer: ChargilyCustomer = {
            id: ctx.rng.id('cus'),
            entity: 'customer',
            livemode: false,
            name: parsed.data.name ?? 'Customer',
            email: parsed.data.email ?? null,
            phone: parsed.data.phone ?? null,
            address: parsed.data.address ?? null,
            metadata: parsed.data.metadata ?? {},
            created_at: now,
            updated_at: now,
          };
          ctx.store.setResource(NS.customers, customer.id, customer);
          return reply.code(201).send(customer);
        });

        api.get<{ Querystring: { per_page?: string; page?: string } }>(
          '/customers',
          async (request, reply) => {
            if (!(await guardRequest(request, reply))) return;
            const list = ctx.store.listResources<ChargilyCustomer>(NS.customers);
            return paginate(list, request.query.per_page, request.query.page, `${prefix}/customers`);
          },
        );

        api.get<{ Params: { id: string } }>('/customers/:id', async (request, reply) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const found = ctx.store.getResource<ChargilyCustomer>(NS.customers, request.params.id);
          if (!found) return reply.code(404).send({ message: 'Customer not found' });
          return found;
        });

        const updateCustomerHandler = async (
          request: FastifyRequest<{ Params: { id: string } }>,
          reply: FastifyReply,
        ) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const existing = ctx.store.getResource<ChargilyCustomer>(NS.customers, request.params.id);
          if (!existing) return reply.code(404).send({ message: 'Customer not found' });
          const parsed = UpdateCustomerSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(422).send({ message: 'Validation failed', errors: parsed.error.flatten() });
          }
          const updated: ChargilyCustomer = {
            ...existing,
            name: parsed.data.name ?? existing.name,
            email: parsed.data.email ?? existing.email,
            phone: parsed.data.phone ?? existing.phone,
            address: parsed.data.address
              ? {
                  country: parsed.data.address.country ?? existing.address?.country ?? 'DZ',
                  state: parsed.data.address.state ?? existing.address?.state ?? 'Algiers',
                  address: parsed.data.address.address ?? existing.address?.address ?? '',
                }
              : existing.address,
            metadata: parsed.data.metadata ?? existing.metadata,
            updated_at: epochSec(),
          };
          ctx.store.setResource(NS.customers, updated.id, updated);
          return updated;
        };

        api.patch('/customers/:id', updateCustomerHandler);
        api.post('/customers/:id', updateCustomerHandler);

        api.delete<{ Params: { id: string } }>('/customers/:id', async (request, reply) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const deleted = ctx.store.deleteResource(NS.customers, request.params.id);
          if (!deleted) return reply.code(404).send({ message: 'Customer not found' });
          return { livemode: false, id: request.params.id, entity: 'customer', deleted: true };
        });

        // Products
        api.post('/products', async (request, reply) => {
          if (!(await guardRequest(request, reply))) return;
          const parsed = CreateProductSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(422).send({ message: 'Validation failed', errors: parsed.error.flatten() });
          }
          const now = epochSec();
          const product: ChargilyProduct = {
            id: ctx.rng.id('prod'),
            entity: 'product',
            livemode: false,
            name: parsed.data.name,
            description: parsed.data.description ?? null,
            images: parsed.data.images ?? [],
            metadata: parsed.data.metadata ?? {},
            created_at: now,
            updated_at: now,
          };
          ctx.store.setResource(NS.products, product.id, product);
          return reply.code(201).send(product);
        });

        api.get<{ Querystring: { per_page?: string; page?: string } }>(
          '/products',
          async (request, reply) => {
            if (!(await guardRequest(request, reply))) return;
            const list = ctx.store.listResources<ChargilyProduct>(NS.products);
            return paginate(list, request.query.per_page, request.query.page, `${prefix}/products`);
          },
        );

        api.get<{ Params: { id: string } }>('/products/:id', async (request, reply) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const found = ctx.store.getResource<ChargilyProduct>(NS.products, request.params.id);
          if (!found) return reply.code(404).send({ message: 'Product not found' });
          return found;
        });

        api.post<{ Params: { id: string } }>('/products/:id', async (request, reply) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const existing = ctx.store.getResource<ChargilyProduct>(NS.products, request.params.id);
          if (!existing) return reply.code(404).send({ message: 'Product not found' });
          const parsed = UpdateProductSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(422).send({ message: 'Validation failed', errors: parsed.error.flatten() });
          }
          const updated: ChargilyProduct = {
            ...existing,
            name: parsed.data.name ?? existing.name,
            description: parsed.data.description ?? existing.description,
            images: parsed.data.images ?? existing.images,
            metadata: parsed.data.metadata ?? existing.metadata,
            updated_at: epochSec(),
          };
          ctx.store.setResource(NS.products, updated.id, updated);
          return updated;
        });

        api.delete<{ Params: { id: string } }>('/products/:id', async (request, reply) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const deleted = ctx.store.deleteResource(NS.products, request.params.id);
          if (!deleted) return reply.code(404).send({ message: 'Product not found' });
          return { livemode: false, id: request.params.id, entity: 'product', deleted: true };
        });

        api.get<{ Params: { id: string }; Querystring: { per_page?: string; page?: string } }>(
          '/products/:id/prices',
          async (request, reply) => {
            if (!(await guardRequest(request, reply, request.params.id))) return;
            const prices = ctx.store
              .listResources<ChargilyPrice>(NS.prices)
              .filter((p) => p.product_id === request.params.id);
            return paginate(
              prices,
              request.query.per_page,
              request.query.page,
              `${prefix}/products/${request.params.id}/prices`,
            );
          },
        );

        // Prices
        api.post('/prices', async (request, reply) => {
          if (!(await guardRequest(request, reply))) return;
          const parsed = CreatePriceSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(422).send({ message: 'Validation failed', errors: parsed.error.flatten() });
          }
          const product = ctx.store.getResource<ChargilyProduct>(NS.products, parsed.data.product_id);
          if (!product) {
            return reply.code(422).send({ message: 'Referenced product_id does not exist' });
          }
          const now = epochSec();
          const price: ChargilyPrice = {
            id: ctx.rng.id('prc'),
            entity: 'price',
            livemode: false,
            amount: parsed.data.amount,
            currency: parsed.data.currency,
            product_id: parsed.data.product_id,
            metadata: parsed.data.metadata ?? {},
            created_at: now,
            updated_at: now,
          };
          ctx.store.setResource(NS.prices, price.id, price);
          return reply.code(201).send(price);
        });

        api.get<{ Querystring: { per_page?: string; page?: string } }>(
          '/prices',
          async (request, reply) => {
            if (!(await guardRequest(request, reply))) return;
            const list = ctx.store.listResources<ChargilyPrice>(NS.prices);
            return paginate(list, request.query.per_page, request.query.page, `${prefix}/prices`);
          },
        );

        api.get<{ Params: { id: string } }>('/prices/:id', async (request, reply) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const found = ctx.store.getResource<ChargilyPrice>(NS.prices, request.params.id);
          if (!found) return reply.code(404).send({ message: 'Price not found' });
          return found;
        });

        api.post<{ Params: { id: string } }>('/prices/:id', async (request, reply) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const existing = ctx.store.getResource<ChargilyPrice>(NS.prices, request.params.id);
          if (!existing) return reply.code(404).send({ message: 'Price not found' });
          const parsed = UpdatePriceSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(422).send({ message: 'Validation failed', errors: parsed.error.flatten() });
          }
          const updated: ChargilyPrice = {
            ...existing,
            metadata: parsed.data.metadata,
            updated_at: epochSec(),
          };
          ctx.store.setResource(NS.prices, updated.id, updated);
          return updated;
        });

        // Checkouts
        api.post('/checkouts', async (request, reply) => {
          const auth = await guardRequest(request, reply);
          if (!auth) return;
          const parsed = CreateCheckoutSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(422).send({ message: 'Validation failed', errors: parsed.error.flatten() });
          }

          let amount = parsed.data.amount ?? 0;
          let currency = parsed.data.currency ?? 'dzd';
          const resolvedItems: ChargilyCheckoutItem[] = [];

          if (parsed.data.items && parsed.data.items.length > 0) {
            amount = 0;
            for (const item of parsed.data.items) {
              const price = ctx.store.getResource<ChargilyPrice>(NS.prices, item.price);
              if (!price) {
                return reply.code(422).send({ message: `Price not found: ${item.price}` });
              }
              currency = price.currency;
              amount += price.amount * item.quantity;
              resolvedItems.push({
                id: price.id,
                entity: 'price',
                amount: price.amount,
                quantity: item.quantity,
                currency: price.currency,
                metadata: price.metadata,
                created_at: price.created_at,
                updated_at: price.updated_at,
                product_id: price.product_id,
              });
            }
          }

          const now = epochSec();
          const id = ctx.rng.id('chk');
          const base = baseUrlFromRequest(request);
          const checkout: ChargilyCheckout = {
            id,
            entity: 'checkout',
            livemode: false,
            amount,
            currency,
            fees: CHARGILY_SPEC.computeFees(amount),
            pass_fees_to_customer: parsed.data.pass_fees_to_customer,
            status: 'pending',
            locale: parsed.data.locale,
            description: parsed.data.description ?? '',
            success_url: parsed.data.success_url,
            failure_url: parsed.data.failure_url ?? parsed.data.success_url,
            webhook_endpoint: parsed.data.webhook_endpoint ?? '',
            payment_method: parsed.data.payment_method,
            invoice_id: null,
            customer_id: parsed.data.customer_id ?? null,
            payment_link_id: null,
            metadata: parsed.data.metadata ?? {},
            created_at: now,
            updated_at: now,
            shipping_address: parsed.data.shipping_address ?? null,
            collect_shipping_address: parsed.data.collect_shipping_address,
            checkout_url: `${base}/pay/chargily/${id}`,
            _items: resolvedItems,
            _secret_key: auth.token,
          };

          ctx.store.setResource(NS.checkouts, id, checkout);
          return reply.code(201).send(publicCheckoutView(checkout));
        });

        api.get<{ Querystring: { per_page?: string; page?: string } }>(
          '/checkouts',
          async (request, reply) => {
            if (!(await guardRequest(request, reply))) return;
            const list = ctx.store
              .listResources<ChargilyCheckout>(NS.checkouts)
              .map(publicCheckoutView);
            return paginate(list, request.query.per_page, request.query.page, `${prefix}/checkouts`);
          },
        );

        api.get<{ Params: { id: string } }>('/checkouts/:id', async (request, reply) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const found = ctx.store.getResource<ChargilyCheckout>(NS.checkouts, request.params.id);
          if (!found) return reply.code(404).send({ message: 'Checkout not found' });
          return publicCheckoutView(found);
        });

        api.get<{ Params: { id: string }; Querystring: { per_page?: string; page?: string } }>(
          '/checkouts/:id/items',
          async (request, reply) => {
            if (!(await guardRequest(request, reply, request.params.id))) return;
            const found = ctx.store.getResource<ChargilyCheckout>(NS.checkouts, request.params.id);
            if (!found) return reply.code(404).send({ message: 'Checkout not found' });
            return paginate(
              found._items ?? [],
              request.query.per_page,
              request.query.page,
              `${prefix}/checkouts/${request.params.id}/items`,
            );
          },
        );

        api.post<{ Params: { id: string } }>('/checkouts/:id/expire', async (request, reply) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const found = ctx.store.getResource<ChargilyCheckout>(NS.checkouts, request.params.id);
          if (!found) return reply.code(404).send({ message: 'Checkout not found' });
          if (found.status !== 'pending') {
            return reply.code(422).send({ message: `Cannot expire checkout in status ${found.status}` });
          }
          found.status = 'expired';
          found.updated_at = epochSec();
          ctx.store.setResource(NS.checkouts, found.id, found);
          return publicCheckoutView(found);
        });

        // Payment Links
        api.post('/payment-links', async (request, reply) => {
          if (!(await guardRequest(request, reply))) return;
          const parsed = CreatePaymentLinkSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(422).send({ message: 'Validation failed', errors: parsed.error.flatten() });
          }
          const resolvedItems: ChargilyPaymentLinkItem[] = [];
          for (const item of parsed.data.items) {
            const price = ctx.store.getResource<ChargilyPrice>(NS.prices, item.price);
            if (!price) {
              return reply.code(422).send({ message: `Price not found: ${item.price}` });
            }
            resolvedItems.push({
              id: price.id,
              entity: 'price',
              amount: price.amount,
              quantity: item.quantity,
              adjustable_quantity: item.adjustable_quantity,
              currency: price.currency,
              metadata: price.metadata,
              created_at: price.created_at,
              updated_at: price.updated_at,
              product_id: price.product_id,
            });
          }
          const now = epochSec();
          const id = ctx.rng.id('plnk');
          const link: ChargilyPaymentLink = {
            id,
            entity: 'payment_link',
            livemode: false,
            name: parsed.data.name,
            active: true,
            after_completion_message: parsed.data.after_completion_message ?? '',
            locale: parsed.data.locale,
            pass_fees_to_customer: parsed.data.pass_fees_to_customer,
            metadata: parsed.data.metadata ?? {},
            created_at: now,
            updated_at: now,
            collect_shipping_address: parsed.data.collect_shipping_address,
            url: `${baseUrlFromRequest(request)}/pay/chargily/link/${id}`,
            _items: resolvedItems,
          };
          ctx.store.setResource(NS.paymentLinks, id, link);
          return reply.code(201).send(publicPaymentLinkView(link));
        });

        api.get<{ Querystring: { per_page?: string; page?: string } }>(
          '/payment-links',
          async (request, reply) => {
            if (!(await guardRequest(request, reply))) return;
            const list = ctx.store
              .listResources<ChargilyPaymentLink>(NS.paymentLinks)
              .map(publicPaymentLinkView);
            return paginate(list, request.query.per_page, request.query.page, `${prefix}/payment-links`);
          },
        );

        api.get<{ Params: { id: string } }>('/payment-links/:id', async (request, reply) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const found = ctx.store.getResource<ChargilyPaymentLink>(NS.paymentLinks, request.params.id);
          if (!found) return reply.code(404).send({ message: 'Payment link not found' });
          return publicPaymentLinkView(found);
        });

        api.post<{ Params: { id: string } }>('/payment-links/:id', async (request, reply) => {
          if (!(await guardRequest(request, reply, request.params.id))) return;
          const existing = ctx.store.getResource<ChargilyPaymentLink>(NS.paymentLinks, request.params.id);
          if (!existing) return reply.code(404).send({ message: 'Payment link not found' });
          const parsed = UpdatePaymentLinkSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(422).send({ message: 'Validation failed', errors: parsed.error.flatten() });
          }
          const updated: ChargilyPaymentLink = {
            ...existing,
            name: parsed.data.name ?? existing.name,
            after_completion_message:
              parsed.data.after_completion_message ?? existing.after_completion_message,
            locale: parsed.data.locale ?? existing.locale,
            pass_fees_to_customer: parsed.data.pass_fees_to_customer ?? existing.pass_fees_to_customer,
            collect_shipping_address:
              parsed.data.collect_shipping_address ?? existing.collect_shipping_address,
            metadata: parsed.data.metadata ?? existing.metadata,
            updated_at: epochSec(),
          };
          ctx.store.setResource(NS.paymentLinks, updated.id, updated);
          return publicPaymentLinkView(updated);
        });

        api.get<{ Params: { id: string }; Querystring: { per_page?: string; page?: string } }>(
          '/payment-links/:id/items',
          async (request, reply) => {
            if (!(await guardRequest(request, reply, request.params.id))) return;
            const found = ctx.store.getResource<ChargilyPaymentLink>(NS.paymentLinks, request.params.id);
            if (!found) return reply.code(404).send({ message: 'Payment link not found' });
            return paginate(
              found._items ?? [],
              request.query.per_page,
              request.query.page,
              `${prefix}/payment-links/${request.params.id}/items`,
            );
          },
        );
      },
      { prefix },
    );
  }

  return app;
}
