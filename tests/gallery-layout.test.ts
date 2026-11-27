import assert from 'node:assert/strict';
import test from 'node:test';
import { createBalancedHexCoordinates } from '../src/gallery/gallery-layout.ts';

function radius(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

test('gallery coordinates are deterministic and unique', () => {
  for (const count of [24, 160, 333]) {
    const first = createBalancedHexCoordinates(count);
    const second = createBalancedHexCoordinates(count);
    const keys = new Set(first.map(({ q, r }) => `${q},${r}`));

    assert.deepEqual(first, second);
    assert.equal(first.length, count);
    assert.equal(keys.size, count);
    assert.deepEqual(first[0], { q: 0, r: 0 });
  }
});

test('incomplete outer rings are distributed rather than clustered', () => {
  const coordinates = createBalancedHexCoordinates(333);
  const outer = coordinates.filter(({ q, r }) => radius(q, r) === 11);

  assert.equal(outer.length, 2);
  assert.ok(radius(outer[0].q - outer[1].q, outer[0].r - outer[1].r) >= 10);
});
