import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  applyNetworkScenario,
  getScenarioHeader,
  isSafeHttpUrl,
  registerRequestAuditHook,
  type SandboxContext,
  type WebhookDispatcher,
} from '@dz-sandbox/core';
import { FullAlgeriaGeoDataset, type GeoDataset } from './geo-dataset.js';
import {
  HISTORY_NS,
  PARCEL_NS,
  scheduleParcelLifecycle,
  type ParcelHistoryEntry,
  type YalidineParcel,
} from './lifecycle.js';
import { YALIDINE_SPEC } from './yalidine.spec.js';

export interface YalidineServerDeps {
  ctx: SandboxContext;
  webhooks?: WebhookDispatcher;
  dataset?: GeoDataset;
}

const CreateParcelItemSchema = z.object({
  order_id: z.string().min(1),
  from_wilaya_name: z.string().min(1).optional(),
  from_wilaya_id: z.coerce.number().int().positive().optional(),
  firstname: z.string().min(1),
  familyname: z.string().min(1),
  contact_phone: z.string().min(1),
  address: z.string().optional().default(''),
  to_wilaya_name: z.string().min(1).optional(),
  to_wilaya_id: z.coerce.number().int().positive().optional(),
  to_commune_name: z.string().min(1).optional(),
  commune_name: z.string().min(1).optional(),
  product_list: z.string().min(1),
  price: z.number().nonnegative(),
  freeshipping: z.boolean().optional().default(false),
  is_stopdesk: z.boolean().optional().default(false),
  stopdesk_id: z.number().int().nonnegative().optional().default(0),
  has_exchange: z.boolean().optional().default(false),
  weight: z.number().positive().optional().default(1),
  webhook_url: z
    .string()
    .max(2048)
    .refine(isSafeHttpUrl, { message: 'URL must use http(s) without embedded credentials' })
    .optional(),
});

const UpdateParcelSchema = z.object({
  firstname: z.string().min(1).optional(),
  familyname: z.string().min(1).optional(),
  contact_phone: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  product_list: z.string().min(1).optional(),
  price: z.number().nonnegative().optional(),
});

function paginateYalidine<T>(items: T[], pageRaw?: string, pageSizeRaw?: string) {
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(pageSizeRaw ?? '25', 10) || 25));
  const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);
  const totalData = items.length;
  const offset = (page - 1) * pageSize;
  const data = items.slice(offset, offset + pageSize);
  return {
    has_more: offset + data.length < totalData,
    total_data: totalData,
    page,
    page_size: pageSize,
    data,
  };
}

export function createYalidineServer(deps: YalidineServerDeps): FastifyInstance {
  const { ctx, webhooks } = deps;
  const dataset = deps.dataset ?? new FullAlgeriaGeoDataset();
  const app = Fastify({ logger: false, bodyLimit: 512 * 1024 });
  registerRequestAuditHook(app, ctx, 'yalidine');

  async function guardRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    resourceId?: string,
  ): Promise<string | undefined> {
    const resolved = ctx.scenarios.resolve({
      provider: 'yalidine',
      headerScenario: getScenarioHeader(request),
      resourceId,
    });
    (request as FastifyRequest & { _dzScenario?: string })._dzScenario = resolved.name;
    if (await applyNetworkScenario(ctx, 'yalidine', request, reply, resolved)) {
      return undefined;
    }

    const apiId = request.headers[YALIDINE_SPEC.authHeaders.apiId];
    const apiToken = request.headers[YALIDINE_SPEC.authHeaders.apiToken];
    if (!apiId || !apiToken) {
      reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Missing X-API-ID or X-API-TOKEN headers',
      });
      return undefined;
    }

    return resolved.name;
  }

  app.get('/health', async () => ({
    status: 'ok',
    service: 'mock-yalidine',
    dataset: dataset.meta,
  }));

  app.register(
    async (v1) => {
      v1.get<{ Querystring: { id?: string; page?: string; page_size?: string } }>(
        '/wilayas',
        async (request, reply) => {
          if (!(await guardRequest(request, reply))) return;
          let list = dataset.getWilayas();
          if (request.query.id) {
            const idNum = Number.parseInt(request.query.id, 10);
            list = list.filter((w) => w.id === idNum);
          }
          return {
            ...paginateYalidine(list, request.query.page, request.query.page_size),
            _dataset_meta: dataset.meta,
          };
        },
      );

      v1.get<{ Querystring: { wilaya_id?: string; page?: string; page_size?: string } }>(
        '/communes',
        async (request, reply) => {
          if (!(await guardRequest(request, reply))) return;
          const wilayaId = request.query.wilaya_id
            ? Number.parseInt(request.query.wilaya_id, 10)
            : undefined;
          const list = dataset.getCommunes(wilayaId);
          return {
            ...paginateYalidine(list, request.query.page, request.query.page_size),
            _dataset_meta: dataset.meta,
          };
        },
      );

      v1.get<{ Querystring: { wilaya_id?: string; page?: string; page_size?: string } }>(
        '/centers',
        async (request, reply) => {
          if (!(await guardRequest(request, reply))) return;
          const wilayaId = request.query.wilaya_id
            ? Number.parseInt(request.query.wilaya_id, 10)
            : undefined;
          const list = dataset.getCenters(wilayaId);
          return paginateYalidine(list, request.query.page, request.query.page_size);
        },
      );

      v1.get<{
        Querystring: { from_wilaya_id?: string; to_wilaya_id?: string; wilaya_id?: string };
      }>('/deliveryfees', async (request, reply) => {
        if (!(await guardRequest(request, reply))) return;
        const fromId = Number.parseInt(request.query.from_wilaya_id ?? '16', 10) || 16;

        if (request.query.to_wilaya_id) {
          const toId = Number.parseInt(request.query.to_wilaya_id, 10);
          const fee = dataset.getDeliveryFee(fromId, toId);
          if (!fee) {
            return reply.code(422).send({
              error: 'INVALID_WILAYA',
              message: `Unsupported wilaya pair ${fromId} -> ${request.query.to_wilaya_id}`,
            });
          }
          return {
            ...fee,
            per_wilaya: [fee],
          };
        }

        const filterIds = request.query.wilaya_id
          ? request.query.wilaya_id
              .split(',')
              .map((s) => Number.parseInt(s.trim(), 10))
              .filter((n) => !Number.isNaN(n))
          : dataset.getWilayas().map((w) => w.id);

        const fees = filterIds
          .map((id) => dataset.getDeliveryFee(fromId, id))
          .filter((f): f is NonNullable<typeof f> => f !== undefined);
        return { data: fees, total_data: fees.length };
      });

      v1.post('/parcels', async (request, reply) => {
        const scenarioName = await guardRequest(request, reply);
        if (!scenarioName) return;

        if (scenarioName === 'invalid_wilaya') {
          return reply.code(422).send({ error: 'INVALID_WILAYA', message: 'Simulated invalid wilaya' });
        }
        if (scenarioName === 'invalid_commune') {
          return reply.code(422).send({ error: 'INVALID_COMMUNE', message: 'Simulated invalid commune' });
        }
        if (scenarioName === 'phone_rejected') {
          return reply.code(422).send({
            error: 'INVALID_PHONE',
            message: 'Simulated invalid Algerian phone number',
          });
        }

        const rawItems = Array.isArray(request.body) ? request.body : [request.body];
        if (rawItems.length === 0 || rawItems.length > 200) {
          return reply.code(422).send({
            error: 'INVALID_BATCH_SIZE',
            message: 'Parcel batch size must be between 1 and 200',
          });
        }

        const parsedItems: Array<z.infer<typeof CreateParcelItemSchema>> = [];
        for (const item of rawItems) {
          const parsed = CreateParcelItemSchema.safeParse(item);
          if (!parsed.success) {
            return reply.code(422).send({
              error: 'VALIDATION_ERROR',
              message: 'Invalid parcel payload',
              details: parsed.error.flatten(),
            });
          }
          parsedItems.push(parsed.data);
        }

        const results: Record<string, YalidineParcel> = {};
        const createdList: YalidineParcel[] = [];

        for (const item of parsedItems) {
          const fromWilaya = dataset.findWilaya(item.from_wilaya_id ?? item.from_wilaya_name ?? 16);
          if (!fromWilaya) {
            return reply.code(422).send({
              error: 'INVALID_WILAYA',
              message: `Unknown origin wilaya: ${item.from_wilaya_id ?? item.from_wilaya_name}`,
            });
          }

          const toWilayaInput = item.to_wilaya_id ?? item.to_wilaya_name;
          if (!toWilayaInput) {
            return reply.code(422).send({
              error: 'INVALID_WILAYA',
              message: 'Destination wilaya (to_wilaya_id or to_wilaya_name) is required',
            });
          }
          const toWilaya = dataset.findWilaya(toWilayaInput);
          if (!toWilaya) {
            return reply.code(422).send({
              error: 'INVALID_WILAYA',
              message: `Unknown destination wilaya: ${toWilayaInput}`,
            });
          }

          const communeInput = item.to_commune_name ?? item.commune_name;
          if (!communeInput) {
            return reply.code(422).send({
              error: 'INVALID_COMMUNE',
              message: 'Destination commune (to_commune_name or commune_name) is required',
            });
          }
          const commune = dataset.findCommune(toWilaya.id, communeInput);
          if (!commune) {
            return reply.code(422).send({
              error: 'INVALID_COMMUNE',
              message: `Commune "${communeInput}" does not belong to wilaya "${toWilaya.name}"`,
            });
          }

          if (!YALIDINE_SPEC.phoneRegex.test(item.contact_phone.trim())) {
            return reply.code(422).send({
              error: 'INVALID_PHONE',
              message: `Invalid Algerian phone number: ${item.contact_phone}`,
            });
          }

          if (item.is_stopdesk) {
            const center = dataset.findCenter(item.stopdesk_id);
            if (!center || center.wilaya_id !== toWilaya.id) {
              return reply.code(422).send({
                error: 'INVALID_STOPDESK',
                message: `Stopdesk center ${item.stopdesk_id} is invalid for wilaya ${toWilaya.name}`,
              });
            }
          } else if (!item.address.trim()) {
            return reply.code(422).send({
              error: 'INVALID_ADDRESS',
              message: 'Home delivery requires a non-empty street address',
            });
          }

          const feeRecord = dataset.getDeliveryFee(fromWilaya.id, toWilaya.id);
          const deliveryFee = item.freeshipping
            ? 0
            : item.is_stopdesk
              ? (feeRecord?.stopdesk_fee ?? 400)
              : (feeRecord?.home_fee ?? 600);

          const tracking = `yal-${ctx.rng.int(100000, 999999)}`;
          const nowIso = ctx.clock.isoNow();

          const parcel: YalidineParcel = {
            tracking,
            order_id: item.order_id,
            from_wilaya_id: fromWilaya.id,
            from_wilaya_name: fromWilaya.name,
            to_wilaya_id: toWilaya.id,
            to_wilaya_name: toWilaya.name,
            to_commune_name: commune.name,
            firstname: item.firstname,
            familyname: item.familyname,
            contact_phone: item.contact_phone,
            address: item.address,
            product_list: item.product_list,
            price: item.price,
            freeshipping: item.freeshipping,
            is_stopdesk: item.is_stopdesk,
            stopdesk_id: item.stopdesk_id,
            has_exchange: item.has_exchange,
            weight: item.weight,
            status: YALIDINE_SPEC.statuses.pending.label,
            last_status: YALIDINE_SPEC.statuses.pending.label,
            status_id: YALIDINE_SPEC.statuses.pending.id,
            delivery_fee: deliveryFee,
            created_at: nowIso,
            updated_at: nowIso,
            webhook_url: item.webhook_url,
          };

          ctx.store.setResource(PARCEL_NS, tracking, parcel);
          ctx.store.setResource<ParcelHistoryEntry[]>(HISTORY_NS, tracking, [
            {
              tracking,
              status: YALIDINE_SPEC.statuses.pending.label,
              status_id: YALIDINE_SPEC.statuses.pending.id,
              reason: 'Colis créé',
              center_name: `Agence ${fromWilaya.name}`,
              date: nowIso,
            },
          ]);

          const effectiveScenario =
            ctx.scenarios.resolve({
              provider: 'yalidine',
              headerScenario: getScenarioHeader(request),
              resourceId: tracking,
              advanceSequence: false,
            }).name || scenarioName;

          scheduleParcelLifecycle(ctx, webhooks, parcel, effectiveScenario);
          results[item.order_id] = parcel;
          createdList.push(parcel);
        }

        return reply.code(201).send({
          import_id: ctx.rng.int(1000, 9999),
          results,
          data: createdList,
        });
      });

      v1.get<{
        Querystring: {
          tracking?: string;
          order_id?: string;
          last_status?: string;
          page?: string;
          page_size?: string;
        };
      }>('/parcels', async (request, reply) => {
        if (!(await guardRequest(request, reply))) return;
        let list = ctx.store.listResources<YalidineParcel>(PARCEL_NS);
        if (request.query.tracking) {
          const set = new Set(request.query.tracking.split(',').map((s) => s.trim()));
          list = list.filter((p) => set.has(p.tracking));
        }
        if (request.query.order_id) {
          list = list.filter((p) => p.order_id === request.query.order_id);
        }
        if (request.query.last_status) {
          list = list.filter((p) => p.last_status === request.query.last_status);
        }
        return paginateYalidine(list, request.query.page, request.query.page_size);
      });

      v1.get<{ Params: { tracking: string } }>('/parcels/:tracking', async (request, reply) => {
        if (!(await guardRequest(request, reply, request.params.tracking))) return;
        const parcel = ctx.store.getResource<YalidineParcel>(PARCEL_NS, request.params.tracking);
        if (!parcel) {
          return reply.code(404).send({ error: 'PARCEL_NOT_FOUND', message: 'Parcel not found' });
        }
        return parcel;
      });

      v1.patch<{ Params: { tracking: string } }>('/parcels/:tracking', async (request, reply) => {
        if (!(await guardRequest(request, reply, request.params.tracking))) return;
        const parcel = ctx.store.getResource<YalidineParcel>(PARCEL_NS, request.params.tracking);
        if (!parcel) {
          return reply.code(404).send({ error: 'PARCEL_NOT_FOUND', message: 'Parcel not found' });
        }
        if (parcel.status_id !== YALIDINE_SPEC.statuses.pending.id) {
          return reply.code(422).send({
            error: 'PARCEL_LOCKED',
            message: `Cannot edit parcel once status is "${parcel.status}"`,
          });
        }
        const parsed = UpdateParcelSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(422).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
        }
        if (parsed.data.contact_phone && !YALIDINE_SPEC.phoneRegex.test(parsed.data.contact_phone)) {
          return reply.code(422).send({ error: 'INVALID_PHONE', message: 'Invalid Algerian phone' });
        }

        const updated: YalidineParcel = {
          ...parcel,
          ...parsed.data,
          updated_at: ctx.clock.isoNow(),
        };
        ctx.store.setResource(PARCEL_NS, updated.tracking, updated);
        return updated;
      });

      v1.delete<{ Params: { tracking: string } }>('/parcels/:tracking', async (request, reply) => {
        if (!(await guardRequest(request, reply, request.params.tracking))) return;
        const parcel = ctx.store.getResource<YalidineParcel>(PARCEL_NS, request.params.tracking);
        if (!parcel) {
          return reply.code(404).send({ error: 'PARCEL_NOT_FOUND', message: 'Parcel not found' });
        }
        if (parcel.status_id === YALIDINE_SPEC.statuses.delivered.id) {
          return reply.code(422).send({ error: 'CANNOT_DELETE_DELIVERED', message: 'Already delivered' });
        }
        ctx.store.deleteResource(PARCEL_NS, parcel.tracking);
        ctx.store.deleteResource(HISTORY_NS, parcel.tracking);
        return { deleted: true, tracking: parcel.tracking };
      });

      v1.get<{
        Querystring: { tracking?: string; status?: string; page?: string; page_size?: string };
      }>('/histories', async (request, reply) => {
        if (!(await guardRequest(request, reply, request.query.tracking))) return;
        let all: ParcelHistoryEntry[] = [];
        if (request.query.tracking) {
          all = ctx.store.getResource<ParcelHistoryEntry[]>(HISTORY_NS, request.query.tracking) ?? [];
        } else {
          const buckets = ctx.store.listResources<ParcelHistoryEntry[]>(HISTORY_NS);
          all = buckets.flat();
        }
        if (request.query.status) {
          all = all.filter((h) => h.status === request.query.status);
        }
        return paginateYalidine(all, request.query.page, request.query.page_size);
      });
    },
    { prefix: '/v1' },
  );

  return app;
}
