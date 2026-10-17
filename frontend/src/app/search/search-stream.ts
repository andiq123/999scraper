import type { Product } from '../models';

export interface SearchEvent {
  type: 'start' | 'chunk' | 'done' | 'error';
  products?: Product[];
  loadedPages?: number;
  totalPages?: number;
  message?: string;
}

export async function readSearchStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  emit: (event: SearchEvent) => void,
  idleMs = 90_000,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let complete = false;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  const receive = (frame: string) => {
    if (complete) return;
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    let event: SearchEvent;
    try {
      event = JSON.parse(data);
      if (
        !event ||
        !['start', 'chunk', 'done', 'error'].includes(event.type) ||
        [event.loadedPages, event.totalPages].some(
          (value) => value != null && (!Number.isSafeInteger(value) || value < 0),
        ) ||
        (event.message != null && typeof event.message !== 'string') ||
        (event.type === 'chunk' &&
          (!Array.isArray(event.products) ||
            event.products.some(
              (product) =>
                !product ||
                typeof product.id !== 'string' ||
                typeof product.title !== 'string' ||
                typeof product.thumbnailURL !== 'string' ||
                !Number.isInteger(product.currency) ||
                (product.price != null && (typeof product.price !== 'number' || !Number.isFinite(product.price))),
            )))
      )
        throw new Error();
    } catch {
      throw new Error('The search service returned a malformed event. Please try again.');
    }
    complete = event.type === 'done' || event.type === 'error';
    emit(event);
  };
  try {
    while (!signal.aborted && !complete) {
      timer = setTimeout(() => {
        timedOut = true;
        cancel();
      }, idleMs);
      const { value, done } = await reader.read();
      clearTimeout(timer);
      if (timedOut) throw new Error('The search connection stalled. Your loaded results are still available.');
      if (signal.aborted) return;
      pending = (pending + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n');
      const frames = pending.split('\n\n');
      pending = frames.pop() ?? '';
      for (const frame of frames) receive(frame);
      if (done) {
        if (pending.trim()) receive(pending);
        break;
      }
    }
    if (!signal.aborted && !complete)
      throw new Error('The search connection ended early. Please retry to finish loading results.');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
