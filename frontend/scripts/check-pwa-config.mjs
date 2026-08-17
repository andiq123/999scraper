import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [worker, deploy] = await Promise.all([
  readFile(new URL('../ngsw-config.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../vercel.json', import.meta.url), 'utf8').then(JSON.parse),
]);

assert.equal(worker.assetGroups[0]?.installMode, 'prefetch');
assert.equal(worker.assetGroups[0]?.updateMode, 'prefetch');
for (const path of ['/ngsw.json', '/ngsw-worker.js']) {
  const rule = deploy.headers.find(({ source }) => source === path);
  assert.match(rule?.headers?.find(({ key }) => key === 'Cache-Control')?.value ?? '', /max-age=0/);
}

console.log('PWA update configuration check passed.');
