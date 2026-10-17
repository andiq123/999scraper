import assert from 'node:assert/strict';
import { canReuseSearchSnapshot, listingBatchSize, listingLimit } from '../src/app/listing-view.ts';

const cached = { activeQuery: 'Corolla', searched: true };
assert.equal(canReuseSearchSnapshot(cached, 'Corolla', null), true, 'reuse the same search even with URL filters');
assert.equal(canReuseSearchSnapshot(cached, ' Corolla ', null), true);
assert.equal(canReuseSearchSnapshot(cached, 'iPhone', null), false, 'a different query needs its own results');
assert.equal(canReuseSearchSnapshot(cached, 'Corolla', 'alert-1'), false, 'alert snapshots must be loaded separately');
assert.equal(canReuseSearchSnapshot(null, 'Corolla', null), false);
assert.equal(canReuseSearchSnapshot({ ...cached, searched: false }, 'Corolla', null), false);
assert.equal(canReuseSearchSnapshot({ ...cached, searched: false }, null, null), true, 'retain unsubmitted drafts');
for (const invalid of [undefined, null, 0, -1, 1.5, NaN, Infinity, '72']) {
  assert.equal(listingLimit(invalid), listingBatchSize);
}
assert.equal(listingLimit(72), 72, 'keep expanded lists when restoring browser history');
assert.equal(listingLimit(listingBatchSize), listingBatchSize);
console.log('Listing batches and cached search restoration checks passed.');
