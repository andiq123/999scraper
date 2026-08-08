import { spawnSync } from 'node:child_process';
import { angularCli, angularDefines } from './api-url.mjs';

const result = spawnSync(angularCli(), ['serve', '--host', '0.0.0.0', ...angularDefines(), ...process.argv.slice(2)], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
