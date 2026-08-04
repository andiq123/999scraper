import { spawnSync } from 'node:child_process';
import { angularCli, apiUrl } from './api-url.mjs';

const result = spawnSync(angularCli(), ['build', '--define', `__API_URL__=${JSON.stringify(apiUrl())}`, ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
