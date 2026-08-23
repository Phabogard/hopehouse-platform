import assert from 'node:assert/strict';
import test from 'node:test';
import { createJournalEntry } from '../src/modules/accounting/accounting.js';

test('creates a balanced journal entry per currency', () => {
  const entry = createJournalEntry({
    id: 'je-1',
    reference: 'wallet-credit-1',
    occurredAt: '2026-08-23T00:00:00.000Z',
    lines: [
      { accountId: 'cash-cdf', currency: 'CDF', amountCents: 20000, type: 'debit' },
      { accountId: 'wallet-client-cdf', currency: 'CDF', amountCents: 20000, type: 'credit' },
    ],
  });

  assert.equal(entry.lines.length, 2);
  assert.equal(entry.lines[0]?.amountCents, 20000);
});

test('rejects an unbalanced journal entry', () => {
  assert.throws(
    () => createJournalEntry({
      id: 'je-2',
      reference: 'invalid',
      occurredAt: '2026-08-23T00:00:00.000Z',
      lines: [
        { accountId: 'cash-cdf', currency: 'CDF', amountCents: 20000, type: 'debit' },
        { accountId: 'wallet-client-cdf', currency: 'CDF', amountCents: 19999, type: 'credit' },
      ],
    }),
    /not balanced for currency CDF/,
  );
});

test('rejects non-positive and unsafe monetary amounts', () => {
  assert.throws(
    () => createJournalEntry({
      id: 'je-3',
      reference: 'invalid-amount',
      occurredAt: '2026-08-23T00:00:00.000Z',
      lines: [
        { accountId: 'cash-cdf', currency: 'CDF', amountCents: 0, type: 'debit' },
        { accountId: 'wallet-client-cdf', currency: 'CDF', amountCents: 0, type: 'credit' },
      ],
    }),
    /positive safe integer/,
  );
});

test('keeps currencies independently balanced', () => {
  const entry = createJournalEntry({
    id: 'je-4',
    reference: 'multi-currency',
    occurredAt: '2026-08-23T00:00:00.000Z',
    lines: [
      { accountId: 'usd-source', currency: 'USD', amountCents: 100, type: 'debit' },
      { accountId: 'usd-counterparty', currency: 'USD', amountCents: 100, type: 'credit' },
      { accountId: 'cdf-source', currency: 'CDF', amountCents: 225000, type: 'debit' },
      { accountId: 'cdf-counterparty', currency: 'CDF', amountCents: 225000, type: 'credit' },
    ],
  });

  assert.equal(entry.lines.filter((line) => line.currency === 'USD').length, 2);
  assert.equal(entry.lines.filter((line) => line.currency === 'CDF').length, 2);
});
