import { createJournalEntry, type JournalEntry } from './accounting.js';

export function customerCdfTopUp(input: {
  id: string;
  occurredAt: string;
  amountCents: number;
}): JournalEntry {
  return createJournalEntry({
    id: input.id,
    reference: `TOPUP-CDF-${input.id}`,
    occurredAt: input.occurredAt,
    lines: [
      { accountId: 'mobile-money-cdf', currency: 'CDF', amountCents: input.amountCents, type: 'debit' },
      { accountId: 'wallet-cdf', currency: 'CDF', amountCents: input.amountCents, type: 'credit' },
    ],
  });
}

export function customerUsdTopUp(input: {
  id: string;
  occurredAt: string;
  amountCents: number;
}): JournalEntry {
  return createJournalEntry({
    id: input.id,
    reference: `TOPUP-USD-${input.id}`,
    occurredAt: input.occurredAt,
    lines: [
      { accountId: 'mobile-money-usd', currency: 'USD', amountCents: input.amountCents, type: 'debit' },
      { accountId: 'wallet-usd', currency: 'USD', amountCents: input.amountCents, type: 'credit' },
    ],
  });
}

export function mobileMoneyFeeCdf(input: {
  id: string;
  occurredAt: string;
  amountCents: number;
}): JournalEntry {
  return createJournalEntry({
    id: input.id,
    reference: `MM-FEE-CDF-${input.id}`,
    occurredAt: input.occurredAt,
    lines: [
      { accountId: 'mobile-money-fees-cdf', currency: 'CDF', amountCents: input.amountCents, type: 'debit' },
      { accountId: 'mobile-money-cdf', currency: 'CDF', amountCents: input.amountCents, type: 'credit' },
    ],
  });
}
