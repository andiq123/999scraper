import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';

// Exercise real service logic without a browser, server, or persistent credentials.
const temporary = await mkdtemp(resolve('.account-flow-'));
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
globalThis.__API_URL__ = '/api/';
globalThis.__VIN_SEARCH_ENGINE_ID__ = '';
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
});
const tokenKey = '999scraper.session';
const navigation = [];
const router = {
  url: '/saved',
  navigate: async (...args) => navigation.push(args),
  navigateByUrl: async (...args) => navigation.push(args),
};
const injector = Injector.create({ providers: [{ provide: Router, useValue: router }] });
async function service(sourcePath, name) {
  const source = resolve(sourcePath);
  const compiled = ts
    .transpileModule(await readFile(source, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, experimentalDecorators: true },
    })
    .outputText.replace(
      /from '(\.\.?\/[^']+)'/g,
      (_match, path) => `from '${pathToFileURL(resolve(dirname(source), path + '.ts')).href}'`,
    );
  const destination = resolve(temporary, name + '.mjs');
  await writeFile(destination, compiled);
  const module = await import(pathToFileURL(destination).href);
  return runInInjectionContext(injector, () => new module[name]());
}
try {
  const auth = await service('src/app/auth/auth.service.ts', 'AuthService');
  storage.set(tokenKey, 'test-token-a');
  globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
  assert.equal(await auth.restore(), false);
  assert.equal(storage.get(tokenKey), 'test-token-a', 'temporary outages must preserve the login');
  assert.match(auth.restoreError(), /temporarily unavailable/);
  globalThis.fetch = async () => Response.json({ id: 'a' });
  assert.equal(await auth.restore(), true, 'a failed restore must be retryable');
  assert.equal(auth.session().id, 'a');
  assert.equal(auth.restoreError(), null);
  await auth.logout();

  storage.set(tokenKey, 'expired');
  globalThis.fetch = async () => Response.json({ error: 'Expired login' }, { status: 401 });
  assert.equal(await auth.restore(), false);
  assert.equal(storage.has(tokenKey), false, 'invalid sessions must be removed');

  let finishRestore;
  storage.set(tokenKey, 'test-token-a');
  globalThis.fetch = async (url) =>
    url.endsWith('current')
      ? new Promise((resolve) => {
          finishRestore = resolve;
        })
      : Response.json({ token: 'test-token-b', id: 'b' });
  const pending = auth.restore();
  await auth.login('111111');
  finishRestore(Response.json({ id: 'a' }));
  await pending;
  assert.equal(auth.session().id, 'b', 'late restores must not replace a newer login');

  let finishPrivate;
  globalThis.fetch = async (url) =>
    url.endsWith('saved')
      ? new Promise((resolve) => {
          finishPrivate = resolve;
        })
      : Response.json({ token: 'test-token-c', id: 'c' });
  const privateRequest = auth.requestPrivate('saved');
  await auth.login('222222');
  finishPrivate(Response.json({ error: 'Expired old session' }, { status: 401 }));
  await assert.rejects(privateRequest);
  assert.equal(auth.session().id, 'c', 'an old request must not expire a newer account');

  const currency = await service('src/app/currency.service.ts', 'CurrencyService');
  globalThis.fetch = async () => new Response('', { status: 503 });
  await currency.load();
  assert.equal(currency.unavailable(), true);
  globalThis.fetch = async () => Response.json({ values: { MDL: 1, EUR: 19, USD: 17 } });
  await currency.load();
  assert.equal(currency.unavailable(), false);
  assert.equal(currency.convert({ price: 10, currency: 1 }, 0), 190, 'exchange rates recover after a failed request');
  console.log('Session recovery, expired credentials, account races, and currency retries passed.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
  delete globalThis.__API_URL__;
  delete globalThis.__VIN_SEARCH_ENGINE_ID__;
  injector.destroy();
  await rm(temporary, { recursive: true, force: true });
}
