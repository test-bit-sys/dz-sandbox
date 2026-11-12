import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli, runDoctor, startSandboxRuntime, type SandboxRuntime } from './index.js';

describe('dz-sandbox CLI & runtime', () => {
  let runtime: SandboxRuntime | undefined;
  let tempDir: string | undefined;

  afterEach(async () => {
    if (runtime) {
      await runtime.stop();
      runtime = undefined;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
    delete process.env.DZ_CONTROL_URL;
  });

  it('boots all 4 servers on ephemeral ports, executes CLI commands, and runs doctor', async () => {
    runtime = await startSandboxRuntime({
      controlPort: 0,
      chargilyPort: 0,
      satimPort: 0,
      yalidinePort: 0,
      watchScenarios: false,
    });

    expect(runtime.ports.control).toBeGreaterThan(0);
    expect(runtime.ports.chargily).toBeGreaterThan(0);
    expect(runtime.ports.satim).toBeGreaterThan(0);
    expect(runtime.ports.yalidine).toBeGreaterThan(0);

    // Health checks across all 4 servers
    const [hCtrl, hChar, hSat, hYal] = await Promise.all([
      fetch(`${runtime.urls.control}/__control/health`).then((r) => r.json()),
      fetch(`http://127.0.0.1:${runtime.ports.chargily}/health`).then((r) => r.json()),
      fetch(`http://127.0.0.1:${runtime.ports.satim}/health`).then((r) => r.json()),
      fetch(`http://127.0.0.1:${runtime.ports.yalidine}/health`).then((r) => r.json()),
    ]);
    expect((hCtrl as { status: string }).status).toBe('ok');
    expect((hChar as { status: string }).status).toBe('ok');
    expect((hSat as { status: string }).status).toBe('ok');
    expect((hYal as { status: string }).status).toBe('ok');

    // Dashboard served in Arabic RTL by default
    const dashHtml = await fetch(`${runtime.urls.control}/`).then((r) => r.text());
    expect(dashHtml).toContain('lang="ar" dir="rtl"');

    // CLI commands against live control server
    process.env.DZ_CONTROL_URL = runtime.urls.control;
    tempDir = mkdtempSync(path.join(tmpdir(), 'dz-cli-'));
    const bundlePath = path.join(tempDir, 'bundle.json');

    expect(await runCli(['--help'])).toBe(0);
    expect(await runCli(['scenario', 'set', 'chargily', 'duplicate_webhook'])).toBe(0);
    expect(await runCli(['scenario', 'set-resource', 'chargily', 'chk_1', 'declined'])).toBe(0);
    expect(await runCli(['scenario', 'invalid'])).toBe(1);
    expect(await runCli(['status'])).toBe(0);
    expect(await runCli(['logs', '--provider', 'chargily', '--limit', '5'])).toBe(0);
    expect(await runCli(['export'])).toBe(0);
    expect(await runCli(['export', bundlePath])).toBe(0);
    expect(await runCli(['reset'])).toBe(0);
    expect(await runCli(['import', bundlePath])).toBe(0);
    expect(await runCli(['import'])).toBe(1);
    expect(await runCli(['stop'])).toBe(0);
    expect(await runCli(['unknown-cmd'])).toBe(1);
    expect(await runCli(['doctor'])).toBe(0);
    expect(await runCli(['record'])).toBe(1);
    expect(await runCli(['replay'])).toBe(1);
    expect(await runCli(['generate'])).toBe(1);
    expect(await runCli(['serve-openapi'])).toBe(1);

    const demoOpenApi = path.resolve(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'fixtures',
      'openapi-demo',
      'courier-demo.openapi.yaml',
    );
    const genDir = path.join(tempDir, 'gen-courier');
    expect(await runCli(['generate', '--openapi', demoOpenApi, '--name', 'courier-demo', '--out', genDir])).toBe(0);
    expect(existsSync(path.join(genDir, 'server.mjs'))).toBe(true);

    const repoFixtures = path.resolve(import.meta.dirname, '..', '..', '..', 'fixtures');
    expect(await runCli(['fixtures', 'validate', repoFixtures])).toBe(0);
    expect(await runCli(['fixtures', 'validate', path.join(tempDir, 'nonexistent')])).toBe(1);

    const doc = await runDoctor({
      DZ_CONTROL_PORT: String(runtime.ports.control),
      DZ_CHARGILY_PORT: String(runtime.ports.chargily),
      DZ_SATIM_PORT: String(runtime.ports.satim),
      DZ_YALIDINE_PORT: String(runtime.ports.yalidine),
    });
    expect(doc.nodeOk).toBe(true);
    expect(doc.ports.every((p) => p.status === 'sandbox_running')).toBe(true);
    expect(doc.envSnippet).toContain('CHARGILY_BASE_URL=');

    // Missing Docker CLI should be reported cleanly as null rather than throwing
    const docNoDocker = await runDoctor(
      {
        DZ_CONTROL_PORT: String(runtime.ports.control),
        DZ_CHARGILY_PORT: String(runtime.ports.chargily),
        DZ_SATIM_PORT: String(runtime.ports.satim),
        DZ_YALIDINE_PORT: String(runtime.ports.yalidine),
      },
      () => {
        throw new Error('spawn docker ENOENT');
      },
    );
    expect(docNoDocker.dockerVersion).toBeNull();
    expect(docNoDocker.nodeOk).toBe(true);

    const distCli = path.resolve(import.meta.dirname, '..', 'dist', 'cli.js');
    if (existsSync(distCli)) {
      const helpOut = execFileSync(process.execPath, [distCli, '--help'], { encoding: 'utf8' });
      expect(helpOut).toContain('dz-sandbox start');
    }
  });
});
