import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const CLI_DIST = path.join(ROOT_DIR, 'packages', 'cli', 'dist', 'index.js');

if (!existsSync(CLI_DIST)) {
  console.error('Missing built CLI dist. Run `npm run build` before `npm run examples:smoke`.');
  process.exit(1);
}

const { startSandboxRuntime } = await import(pathToFileURL(CLI_DIST).href);

function runStep(label, commandArgs, cwd, env) {
  console.log(`\n=== Running example smoke: ${label} ===`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, commandArgs, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Example "${label}" failed with exit code ${String(code)}`));
      } else {
        resolve();
      }
    });
  });
}

const runtime = await startSandboxRuntime({
  controlPort: 0,
  chargilyPort: 0,
  satimPort: 0,
  yalidinePort: 0,
  watchScenarios: false,
  storeMode: 'memory',
});

const env = {
  DZ_CONTROL_URL: runtime.urls.control,
  CHARGILY_BASE_URL: runtime.urls.chargily,
  SATIM_BASE_URL: runtime.urls.satim,
  YALIDINE_BASE_URL: runtime.urls.yalidine,
};

try {
  await runStep('examples/express-checkout', ['demo.mjs'], path.join(ROOT_DIR, 'examples', 'express-checkout'), env);
  await runStep('examples/nextjs-cod-store', ['demo.mjs'], path.join(ROOT_DIR, 'examples', 'nextjs-cod-store'), env);
  await runStep(
    'examples/test-with-vitest',
    [path.join(ROOT_DIR, 'node_modules', 'vitest', 'vitest.mjs'), 'run'],
    path.join(ROOT_DIR, 'examples', 'test-with-vitest'),
    env,
  );
  console.log('\nAll 3 examples passed smoke verification!');
} finally {
  await runtime.stop();
}
