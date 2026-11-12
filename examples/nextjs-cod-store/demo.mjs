import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const CONTROL_URL = process.env.DZ_CONTROL_URL ?? 'http://127.0.0.1:4000';
const YALIDINE_BASE = process.env.YALIDINE_BASE_URL ?? 'http://127.0.0.1:4003/v1';

async function loadPostHandler() {
  const routePath = path.resolve(import.meta.dirname, 'app/api/orders/cod/route.ts');
  const source = readFileSync(routePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'dz-nextjs-cod-'));
  const tmpFile = path.join(tmpDir, 'route.mjs');
  writeFileSync(tmpFile, transpiled.outputText, 'utf8');
  try {
    const mod = await import(pathToFileURL(tmpFile).href);
    return mod.POST;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function run() {
  const POST = await loadPostHandler();
  await fetch(`${CONTROL_URL}/__control/reset`, { method: 'POST' });

  const sampleOrder = {
    orderId: 'COD-DEMO-1',
    firstname: 'Amine',
    familyname: 'Khelifi',
    contactPhone: '0555123456',
    address: '12 Rue Didouche Mourad',
    communeName: 'Alger Centre',
    wilayaName: 'Alger',
    productList: 'Montre classique x1',
    codAmount: 4500,
  };

  // 1) Happy path (created_ok)
  await fetch(`${CONTROL_URL}/__control/scenario/yalidine`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: 'created_ok' }),
  });

  const okRes = await POST(
    new Request('http://127.0.0.1:3000/api/orders/cod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleOrder),
    }),
  );
  const okBody = await okRes.json();
  console.log('1) created_ok -> HTTP', okRes.status, JSON.stringify(okBody));
  if (okRes.status !== 201 || !okBody.ok) {
    throw new Error(`Expected 201 ok=true, got ${okRes.status}`);
  }

  // 2) Failure scenario: phone_rejected -> route maps upstream 4xx to 422
  await fetch(`${CONTROL_URL}/__control/scenario/yalidine`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: 'phone_rejected' }),
  });

  const phoneRes = await POST(
    new Request('http://127.0.0.1:3000/api/orders/cod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleOrder),
    }),
  );
  const phoneBody = await phoneRes.json();
  console.log('2) phone_rejected -> HTTP', phoneRes.status, JSON.stringify(phoneBody));
  if (phoneRes.status !== 422 || phoneBody.error !== 'YALIDINE_REJECTED') {
    throw new Error(`Expected 422 YALIDINE_REJECTED, got ${phoneRes.status}`);
  }

  // 3) Failure scenario: rate_limited -> route maps 429 to retryable 503
  await fetch(`${CONTROL_URL}/__control/scenario/yalidine`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: 'rate_limited' }),
  });

  const rateRes = await POST(
    new Request('http://127.0.0.1:3000/api/orders/cod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleOrder),
    }),
  );
  const rateBody = await rateRes.json();
  console.log('3) rate_limited -> HTTP', rateRes.status, JSON.stringify(rateBody));
  if (rateRes.status !== 503 || rateBody.upstreamStatus !== 429) {
    throw new Error(`Expected 503 upstreamStatus=429, got ${rateRes.status}`);
  }

  // Restore clean state for subsequent consumers
  await fetch(`${CONTROL_URL}/__control/scenario/yalidine`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: 'created_ok' }),
  });

  // Verify parcel query endpoint on Yalidine
  const listRes = await fetch(`${YALIDINE_BASE}/parcels`, {
    headers: {
      'X-API-ID': process.env.YALIDINE_API_ID ?? 'test_api_id',
      'X-API-TOKEN': process.env.YALIDINE_API_TOKEN ?? 'test_api_token',
    },
  });
  if (!listRes.ok) {
    throw new Error(`Expected GET /parcels 200, got ${listRes.status}`);
  }
  console.log('nextjs-cod-store demo OK: happy path 201, phone_rejected->422, rate_limited->503');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
