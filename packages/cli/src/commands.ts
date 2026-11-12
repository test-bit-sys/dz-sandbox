import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createOpenApiMockServer,
  createRecorderProxy,
  createReplayServer,
  generateOpenApiProviderFiles,
  MemoryStore,
  ScenarioEngine,
  SeededRNG,
  validateFixturesDirectory,
  VirtualClock,
} from '@dz-sandbox/core';
import { runDoctor } from './doctor.js';
import { startSandboxRuntime } from './runtime.js';

const PID_FILE = path.resolve(process.cwd(), '.dz-sandbox.pid');

function getControlUrl(): string {
  const port = process.env.DZ_CONTROL_PORT ?? '4000';
  return (process.env.DZ_CONTROL_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, '');
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1]!.startsWith('--')) {
    return args[idx + 1];
  }
  return undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

async function callControl(pathSuffix: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${getControlUrl()}${pathSuffix}`, {
    ...init,
    headers: {
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return JSON.parse(text) as unknown;
}

function printHelp(): void {
  console.log(`dz-sandbox — Local Algerian Payment & Delivery Sandbox

Usage:
  dz-sandbox start [--host 127.0.0.1] [--store memory|sqlite] [--scenarios-dir ./scenarios] [--daemon]
  dz-sandbox stop
  dz-sandbox status
  dz-sandbox reset
  dz-sandbox scenario set <provider> <name>
  dz-sandbox scenario set-resource <provider> <resourceId> <name>
  dz-sandbox logs [--provider chargily] [--limit 20]
  dz-sandbox export [file]
  dz-sandbox import <file>
  dz-sandbox record --provider <name> --upstream <url> --out <dir> [--port 4100] [--no-redact --confirm-unredacted]
  dz-sandbox replay --provider <name> --fixtures <dir> [--port 4101]
  dz-sandbox fixtures validate [dir]
  dz-sandbox generate --openapi <file> --name <provider> [--out ./generated-providers/<name>]
  dz-sandbox serve-openapi --openapi <file> --name <provider> [--port 4200]
  dz-sandbox doctor`);
}

export async function runCli(argv: string[]): Promise<number> {
  const [cmd, sub, arg1, arg2, arg3] = argv;

  if (!cmd || cmd === '--help' || cmd === '-h') {
    printHelp();
    return 0;
  }

  if (cmd === 'start') {
    const host = getFlag(argv, '--host');
    const storeMode = getFlag(argv, '--store');
    const scenariosDir = getFlag(argv, '--scenarios-dir');
    if (storeMode) process.env.DZ_STORE = storeMode;

    if (hasFlag(argv, '--daemon')) {
      const cliEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'cli.js');
      const childArgs = [cliEntry, 'start', ...argv.slice(1).filter((a) => a !== '--daemon')];
      const child = spawn(process.execPath, childArgs, {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.unref();
      if (child.pid) {
        writeFileSync(PID_FILE, String(child.pid), 'utf8');
        console.log(`dz-sandbox started in background (PID ${child.pid})`);
      }
      return 0;
    }

    const runtime = await startSandboxRuntime({ host, scenariosDir });
    writeFileSync(PID_FILE, String(process.pid), 'utf8');
    console.log('dz-sandbox running:');
    console.log(`  Dashboard & Control: ${runtime.urls.control}`);
    console.log(`  Chargily Pay v2:     ${runtime.urls.chargily}`);
    console.log(`  SATIM Gateway:       ${runtime.urls.satim}`);
    console.log(`  Yalidine v1:         ${runtime.urls.yalidine}`);

    const shutdown = async () => {
      await runtime.stop();
      if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
    return 0;
  }

  if (cmd === 'stop') {
    if (!existsSync(PID_FILE)) {
      console.log('No .dz-sandbox.pid file found.');
      return 0;
    }
    const pid = Number.parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Stopped dz-sandbox (PID ${pid})`);
    } catch (err) {
      console.error(`Failed to stop PID ${pid}:`, (err as Error).message);
    }
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
    return 0;
  }

  if (cmd === 'reset') {
    const res = await callControl('/__control/reset', { method: 'POST', body: '{}' });
    console.log(JSON.stringify(res, null, 2));
    return 0;
  }

  if (cmd === 'status') {
    const [health, state] = await Promise.all([
      callControl('/__control/health'),
      callControl('/__control/state'),
    ]);
    console.log(JSON.stringify({ health, state }, null, 2));
    return 0;
  }

  if (cmd === 'scenario') {
    if (sub === 'set' && arg1 && arg2) {
      const res = await callControl(`/__control/scenario/${encodeURIComponent(arg1)}`, {
        method: 'PUT',
        body: JSON.stringify({ scenario: arg2 }),
      });
      console.log(JSON.stringify(res, null, 2));
      return 0;
    }
    if (sub === 'set-resource' && arg1 && arg2 && arg3) {
      const res = await callControl(
        `/__control/scenario/${encodeURIComponent(arg1)}/${encodeURIComponent(arg2)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ scenario: arg3 }),
        },
      );
      console.log(JSON.stringify(res, null, 2));
      return 0;
    }
    console.error('Usage: dz-sandbox scenario set <provider> <name>');
    return 1;
  }

  if (cmd === 'logs') {
    const provider = getFlag(argv, '--provider');
    const limit = getFlag(argv, '--limit') ?? '20';
    const qs = new URLSearchParams({ limit });
    if (provider) qs.set('provider', provider);
    const res = await callControl(`/__control/requests?${qs.toString()}`);
    console.log(JSON.stringify(res, null, 2));
    return 0;
  }

  if (cmd === 'export') {
    const bundle = await callControl('/__control/export');
    const json = JSON.stringify(bundle, null, 2);
    if (sub) {
      writeFileSync(path.resolve(process.cwd(), sub), json, 'utf8');
      console.log(`Exported sandbox bundle to ${sub}`);
    } else {
      console.log(json);
    }
    return 0;
  }

  if (cmd === 'import') {
    if (!sub) {
      console.error('Usage: dz-sandbox import <file>');
      return 1;
    }
    const raw = JSON.parse(readFileSync(path.resolve(process.cwd(), sub), 'utf8')) as unknown;
    const res = await callControl('/__control/import', {
      method: 'POST',
      body: JSON.stringify(raw),
    });
    console.log(JSON.stringify(res, null, 2));
    return 0;
  }

  if (cmd === 'doctor') {
    const report = await runDoctor(process.env);
    console.log('dz-sandbox doctor');
    console.log(`  Node.js: ${report.nodeVersion} (${report.nodeOk ? 'OK' : 'FAIL: >=20 required'})`);
    console.log(`  Docker:  ${report.dockerVersion ?? 'not installed (optional for local Node run)'}`);
    console.log(`  Store:   ${report.storeMode}`);
    console.log('  Ports:');
    for (const p of report.ports) {
      console.log(`    - ${p.name} (${p.port}): ${p.status}`);
    }
    console.log('\nPaste into your .env:\n');
    console.log(report.envSnippet);
    return report.nodeOk ? 0 : 1;
  }

  if (cmd === 'fixtures' && sub === 'validate') {
    const targetDir = path.resolve(process.cwd(), arg1 ?? 'fixtures');
    const result = validateFixturesDirectory(targetDir);
    console.log(
      `Validated ${result.filesChecked} fixture file(s) in ${targetDir} (captured: ${result.capturedCount}, seed: ${result.seedCount})`,
    );
    if (!result.valid) {
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      return 1;
    }
    return 0;
  }

  if (cmd === 'record') {
    const provider = getFlag(argv, '--provider');
    const upstreamUrl = getFlag(argv, '--upstream');
    const outDir = getFlag(argv, '--out');
    if (!provider || !upstreamUrl || !outDir) {
      console.error(
        'Usage: dz-sandbox record --provider <name> --upstream <url> --out <dir> [--port 4100] [--no-redact --confirm-unredacted]',
      );
      return 1;
    }
    const port = Number.parseInt(getFlag(argv, '--port') ?? '4100', 10);
    const noRedact = hasFlag(argv, '--no-redact');
    const confirmUnredacted = hasFlag(argv, '--confirm-unredacted');
    const allowLocalhostUpstream = !hasFlag(argv, '--disallow-localhost-upstream');
    const { app } = createRecorderProxy({
      provider,
      upstreamUrl,
      outDir: path.resolve(process.cwd(), outDir),
      redact: !noRedact,
      confirmUnredacted,
      allowLocalhostUpstream,
    });
    const addr = await app.listen({ host: '127.0.0.1', port });
    console.log(`dz-sandbox recorder proxy listening at ${addr} -> ${upstreamUrl}`);
    console.log(`Redaction: ${noRedact ? 'DISABLED (do NOT commit or store in fixtures/)' : 'ENABLED'}`);
    const shutdown = async () => {
      await app.close();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
    return 0;
  }

  if (cmd === 'replay') {
    const provider = getFlag(argv, '--provider');
    const fixturesDir = getFlag(argv, '--fixtures');
    if (!provider || !fixturesDir) {
      console.error('Usage: dz-sandbox replay --provider <name> --fixtures <dir> [--port 4101]');
      return 1;
    }
    const port = Number.parseInt(getFlag(argv, '--port') ?? '4101', 10);
    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(1337);
    const scenarios = new ScenarioEngine(store);
    const ctx = { store, clock, rng, scenarios };
    const { app, exchanges } = createReplayServer({
      provider,
      fixturesDir: path.resolve(process.cwd(), fixturesDir),
      ctx,
    });
    const addr = await app.listen({ host: '127.0.0.1', port });
    console.log(`dz-sandbox replay server (${provider}) listening at ${addr} (${exchanges.length} fixture(s))`);
    const shutdown = async () => {
      await app.close();
      store.close();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
    return 0;
  }

  if (cmd === 'generate') {
    const openApiFile = getFlag(argv, '--openapi');
    const provider = getFlag(argv, '--name');
    if (!openApiFile || !provider) {
      console.error(
        'Usage: dz-sandbox generate --openapi <file> --name <provider> [--out ./generated-providers/<name>]',
      );
      return 1;
    }
    const outDir = getFlag(argv, '--out') ?? path.resolve(process.cwd(), 'generated-providers', provider);
    const res = generateOpenApiProviderFiles({
      provider,
      openApiPath: path.resolve(process.cwd(), openApiFile),
      outDir,
    });
    console.log(
      `[EXPERIMENTAL] Generated OpenAPI mock provider "${res.provider}" at ${res.outDir} (${res.routes.length} route(s))`,
    );
    for (const f of res.files) {
      console.log(`  - ${f}`);
    }
    return 0;
  }

  if (cmd === 'serve-openapi') {
    const openApiFile = getFlag(argv, '--openapi');
    const provider = getFlag(argv, '--name');
    if (!openApiFile || !provider) {
      console.error('Usage: dz-sandbox serve-openapi --openapi <file> --name <provider> [--port 4200]');
      return 1;
    }
    const port = Number.parseInt(getFlag(argv, '--port') ?? '4200', 10);
    const specText = readFileSync(path.resolve(process.cwd(), openApiFile), 'utf8');
    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(1337);
    const scenarios = new ScenarioEngine(store);
    const { app, routes } = createOpenApiMockServer({
      provider,
      spec: specText,
      ctx: { store, clock, rng, scenarios },
    });
    const addr = await app.listen({ host: '127.0.0.1', port });
    console.log(
      `[EXPERIMENTAL] dz-sandbox OpenAPI mock "${provider}" listening at ${addr} (${routes.length} route(s))`,
    );
    const shutdown = async () => {
      await app.close();
      store.close();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
    return 0;
  }

  printHelp();
  return 1;
}
