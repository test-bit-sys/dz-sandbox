// Next.js App Router API Route demonstrating COD parcel creation against mock-yalidine
// Configure YALIDINE_BASE_URL=http://127.0.0.1:4003/v1 in .env.local

const YALIDINE_BASE = process.env.YALIDINE_BASE_URL ?? 'http://127.0.0.1:4003/v1';
const YALIDINE_ID = process.env.YALIDINE_API_ID ?? 'test_api_id';
const YALIDINE_TOKEN = process.env.YALIDINE_API_TOKEN ?? 'test_api_token';

export async function POST(request: Request): Promise<Response> {
  const order = (await request.json()) as {
    orderId: string;
    firstname: string;
    familyname: string;
    contactPhone: string;
    address: string;
    communeName: string;
    wilayaName: string;
    productList: string;
    codAmount: number;
    isStopdesk?: boolean;
    stopdeskId?: number;
  };

  const payload = [
    {
      order_id: order.orderId,
      from_wilaya_name: 'Alger',
      firstname: order.firstname,
      familyname: order.familyname,
      contact_phone: order.contactPhone,
      address: order.address,
      to_commune_name: order.communeName,
      to_wilaya_name: order.wilayaName,
      product_list: order.productList,
      price: order.codAmount,
      do_insurance: false,
      declared_value: order.codAmount,
      freeshipping: false,
      is_stopdesk: Boolean(order.isStopdesk),
      ...(order.stopdeskId ? { stopdesk_id: order.stopdeskId } : {}),
      has_exchange: false,
    },
  ];

  const upstream = await fetch(`${YALIDINE_BASE}/parcels`, {
    method: 'POST',
    headers: {
      'X-API-ID': YALIDINE_ID,
      'X-API-TOKEN': YALIDINE_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    return Response.json(
      { error: 'YALIDINE_REJECTED', upstreamStatus: upstream.status, detail: data },
      { status: upstream.status === 429 ? 503 : 422 },
    );
  }

  return Response.json({ ok: true, parcel: data }, { status: 201 });
}
