#!/usr/bin/env node
import { runCli } from './commands.js';

runCli(process.argv.slice(2)).then(
  (code) => {
    if (code !== 0) process.exit(code);
  },
  (err) => {
    console.error((err as Error).message);
    process.exit(1);
  },
);
