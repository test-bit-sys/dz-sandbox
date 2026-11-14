import { execSync } from 'node:child_process';
import net from 'node:net';

export interface PortCheckResult {
  name: string;
  port: number;
  status: 'free' | 'in_use' | 'sandbox_running';
}

export interface DoctorReport {
  nodeVersion: string;
  nodeOk: boolean;
  dockerVersion: string | null;
  storeMode: string;
  ports: PortCheckResult[];
  envSnippet: string;
}

function checkPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function isSandboxHealth(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { service?: string };
    return Boolean(data.service);
  } catch {
    return false;
  }
}

export type ExecCommandFn = (command: string) => Buffer | string;

export async function runDoctor(
  env: NodeJS.ProcessEnv = process.env,
  execCmd: ExecCommandFn = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }),
): Promise<DoctorReport> {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  const nodeOk = major >= 20;

  let dockerVersion: string | null = null;
  try {
    dockerVersion = execCmd('docker --version').toString('utf8').trim();
  } catch {
    dockerVersion = null;
  }

  const targets = [
    { name: 'control', port: Number.parseInt(env.DZ_CONTROL_PORT ?? '4000', 10) || 4000 },
    { name: 'chargily', port: Number.parseInt(env.DZ_CHARGILY_PORT ?? '4001', 10) || 4001 },
    { name: 'satim', port: Number.parseInt(env.DZ_SATIM_PORT ?? '4002', 10) || 4002 },
    { name: 'yalidine', port: Number.parseInt(env.DZ_YALIDINE_PORT ?? '4003', 10) || 4003 },
    { name: 'baridimob', port: Number.parseInt(env.DZ_BARIDIMOB_PORT ?? '4004', 10) || 4004 },
  ];

  const ports: PortCheckResult[] = [];
  for (const t of targets) {
    const free = await checkPortFree(t.port);
    if (free) {
      ports.push({ name: t.name, port: t.port, status: 'free' });
    } else if (await isSandboxHealth(t.port)) {
      ports.push({ name: t.name, port: t.port, status: 'sandbox_running' });
    } else {
      ports.push({ name: t.name, port: t.port, status: 'in_use' });
    }
  }

  const cPort = targets[0]!.port;
  const chPort = targets[1]!.port;
  const saPort = targets[2]!.port;
  const yaPort = targets[3]!.port;
  const bmPort = targets[4]!.port;

  const envSnippet = [
    `# dz-sandbox local URLs`,
    `DZ_CONTROL_URL=http://127.0.0.1:${cPort}`,
    `CHARGILY_BASE_URL=http://127.0.0.1:${chPort}/api/v2`,
    `CHARGILY_SECRET_KEY=test_sk_dz_sandbox_chargily_secret`,
    `SATIM_BASE_URL=http://127.0.0.1:${saPort}/payment/rest`,
    `SATIM_USERNAME=test_merchant`,
    `SATIM_PASSWORD=test_password`,
    `YALIDINE_BASE_URL=http://127.0.0.1:${yaPort}/v1`,
    `YALIDINE_API_ID=test_api_id`,
    `YALIDINE_API_TOKEN=test_api_token`,
    `BARIDIMOB_BASE_URL=http://127.0.0.1:${bmPort}/mobilebank/service`,
  ].join('\n');

  return {
    nodeVersion: process.version,
    nodeOk,
    dockerVersion,
    storeMode: env.DZ_STORE ?? 'memory',
    ports,
    envSnippet,
  };
}
