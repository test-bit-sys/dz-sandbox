import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './cli.js';
import { runDoctor } from './doctor.js';
import { startSandboxRuntime, type SandboxRuntime } from './runtime.js';

describe('dz-sandbox CLI & runtime', () => {
  let runtime: SandboxRuntime | undefined;

  afterEach(async () => {
    if (runtime) {
      await runtime.stop();
      runtime = undefined;
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
    expect(await runCli(['--help'])).toBe(0);
    expect(await runCli(['scenario', 'set', 'chargily', 'duplicate_webhook'])).toBe(0);
    expect(await runCli(['scenario', 'set-resource', 'chargily', 'chk_1', 'declined'])).toBe(0);
    expect(await runCli(['status'])).toBe(0);
    expect(await runCli(['logs', '--limit', '5'])).toBe(0);
    expect(await runCli(['export'])).toBe(0);
    expect(await runCli(['reset'])).toBe(0);
    expect(await runCli(['doctor'])).toBe(0);

    const doc = await runDoctor({
      DZ_CONTROL_PORT: String(runtime.ports.control),
      DZ_CHARGILY_PORT: String(runtime.ports.chargily),
      DZ_SATIM_PORT: String(runtime.ports.satim),
      DZ_YALIDINE_PORT: String(runtime.ports.yalidine),
    });
    expect(doc.nodeOk).toBe(true);
    expect(doc.ports.every((p) => p.status === 'sandbox_running')).toBe(true);
    expect(doc.envSnippet).toContain('CHARGILY_BASE_URL=');
  });
});
