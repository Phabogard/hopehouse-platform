import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNonNegativeAmount,
  assertValidCode,
  assertValidDateRange,
} from '../src/modules/catalogue/catalogue.js';

test('catalogue codes are normalized and constrained', () => {
  assert.equal(assertValidCode('  INTERNET_AIRTEL  '), 'INTERNET_AIRTEL');
  assert.equal(assertValidCode('CANAL_30J'), 'CANAL_30J');
  assert.throws(() => assertValidCode('internet-airtel'));
  assert.throws(() => assertValidCode(''));
  assert.throws(() => assertValidCode('AIRTEL SPACE'));
});

test('catalogue validity periods must be chronological', () => {
  const start = new Date('2026-01-01T00:00:00.000Z');
  const end = new Date('2026-02-01T00:00:00.000Z');
  assert.doesNotThrow(() => assertValidDateRange(start, end));
  assert.doesNotThrow(() => assertValidDateRange(null, end));
  assert.throws(() => assertValidDateRange(end, start));
  assert.throws(() => assertValidDateRange(start, start));
});

test('catalogue monetary amounts are non-negative safe integers', () => {
  assert.doesNotThrow(() => assertNonNegativeAmount(0));
  assert.doesNotThrow(() => assertNonNegativeAmount(20_000));
  assert.throws(() => assertNonNegativeAmount(-1));
  assert.throws(() => assertNonNegativeAmount(1.5));
  assert.throws(() => assertNonNegativeAmount(Number.MAX_SAFE_INTEGER + 1));
});
