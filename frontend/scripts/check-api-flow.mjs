import assert from 'node:assert/strict';
import { ApiError, requestJson } from '../src/app/api-request.ts';
import { returnPath } from '../src/app/auth/return-path.ts';
import { readSearchStream } from '../src/app/search/search-stream.ts';

for (const path of ['/saved', '/history', '/alerts', '/account', '/?q=iphone&filters=abc', '/saved?sort=price']) {
  assert.equal(returnPath(path), path);
}
for (const path of [
  null,
  '',
  'https://example.com',
  '//example.com',
  '/\\example.com',
  '/login',
  '/register',
  '/unknown',
  '/saved/../../login',
  '/saved\n',
]) {
  assert.equal(returnPath(path), '/');
}
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => Response.json({ count: 3 });
  assert.deepEqual(await requestJson('/api/test'), { count: 3 });
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await requestJson('/api/test'), undefined);
  globalThis.fetch = async () => Response.json({ error: 'Invalid login code' }, { status: 401 });
  await assert.rejects(
    requestJson('/api/test'),
    (error) => error instanceof ApiError && error.status === 401 && error.message === 'Invalid login code',
  );
  globalThis.fetch = async () => new Response('Bad gateway', { status: 502 });
  await assert.rejects(requestJson('/api/test'), /temporarily unavailable/);
  globalThis.fetch = async () => Response.json({ error: { secret: 'ignore' } }, { status: 500 });
  await assert.rejects(requestJson('/api/test'), /temporarily unavailable/);
  globalThis.fetch = async () => new Response('<html>not json</html>');
  await assert.rejects(requestJson('/api/test'), /unreadable response/);
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(requestJson('/api/test'), /Check your connection/);
  globalThis.fetch = async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  await assert.rejects(requestJson('/api/test', {}, 5), /took too long/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requestJson('/api/test', { signal: controller.signal }), { name: 'AbortError' });
} finally {
  globalThis.fetch = originalFetch;
}
const encoder = new TextEncoder();
function stream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}
const signal = new AbortController().signal;
const events = [];
await readSearchStream(
  stream([
    ': keepalive\r\n\r\ndata: {"type":"start"}\r',
    '\n\r\ndata: {"type":"chunk","products":[]}\n\ndata: {"type":"done"}',
  ]),
  signal,
  (event) => events.push(event.type),
);
assert.deepEqual(events, ['start', 'chunk', 'done']);
await assert.rejects(
  readSearchStream(stream(['data: {"type":"chunk","products":[]}\n\n']), signal, () => {}),
  /ended early/,
);
for (const data of [
  'not json',
  'null',
  '{"type":"unknown"}',
  '{"type":"chunk","products":{}}',
  '{"type":"chunk","products":[null]}',
  '{"type":"start","totalPages":-1}',
  '{"type":"error","message":{}}',
]) {
  await assert.rejects(
    readSearchStream(stream([`data: ${data}\n\n`]), signal, () => {}),
    /malformed event/,
  );
}
await readSearchStream(stream(['data: {"type":"error","message":"upstream failed"}\n\n']), signal, () => {});
await assert.rejects(
  readSearchStream(stream(['data: {"type":"done"}\n\n']), signal, () => {
    throw new Error('consumer error');
  }),
  /consumer error/,
  'consumer errors must not be reported as malformed JSON',
);
await assert.rejects(
  readSearchStream(new ReadableStream(), signal, () => {}, 5),
  /stalled/,
);
const cancelled = new AbortController();
const reading = readSearchStream(new ReadableStream(), cancelled.signal, () => {}, 100);
cancelled.abort();
await reading;
console.log('API failures, timeouts, safe login destinations, and stream recovery checks passed.');
