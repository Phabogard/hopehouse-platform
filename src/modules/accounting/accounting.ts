import { ValidationError } from '../../core/errors.js';

export type AccountingLineType = 'debit' | 'credit';

export interface JournalLine {
  readonly accountId: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly type: AccountingLineType;
  readonly description?: string;
}

export interface JournalEntry {
  readonly id: string;
  readonly reference: string;
  readonly occurredAt: string;
  readonly lines: readonly JournalLine[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CreateJournalEntryInput {
  readonly id: string;
  readonly reference: string;
  readonly occurredAt: string;
  readonly lines: readonly JournalLine[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

function assertNonBlank(value: string, field: string): void {
  if (!value.trim()) {
    throw new ValidationError(`${field} is required`);
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(`${field} must be a positive safe integer`);
  }
}

function assertBalanced(lines: readonly JournalLine[]): void {
  const totals = new Map<string, { debit: number; credit: number }>();

  for (const line of lines) {
    const total = totals.get(line.currency) ?? { debit: 0, credit: 0 };
    total[line.type] += line.amountCents;
    totals.set(line.currency, total);
  }

  for (const [currency, total] of totals) {
    if (total.debit !== total.credit) {
      throw new ValidationError(`Journal entry is not balanced for currency ${currency}`);
    }
  }
}

export function createJournalEntry(input: CreateJournalEntryInput): JournalEntry {
  assertNonBlank(input.id, 'id');
  assertNonBlank(input.reference, 'reference');
  assertNonBlank(input.occurredAt, 'occurredAt');

  if (input.lines.length < 2) {
    throw new ValidationError('A journal entry requires at least two lines');
  }

  for (const line of input.lines) {
    assertNonBlank(line.accountId, 'accountId');
    assertNonBlank(line.currency, 'currency');
    assertPositiveInteger(line.amountCents, 'amountCents');
  }

  assertBalanced(input.lines);

  return Object.freeze({
    id: input.id,
    reference: input.reference,
    occurredAt: input.occurredAt,
    lines: Object.freeze([...input.lines]),
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}
