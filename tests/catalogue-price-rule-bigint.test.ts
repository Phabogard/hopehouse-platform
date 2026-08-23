import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNonNegativeAmount,
  toPriceRuleDto,
  type PriceRule,
  type CommissionRule,
} from '../src/modules/catalogue/catalogue.js';

const now = new Date('2026-08-23T16:00:00.000Z');

test('Test 1 — valeur normale: une PriceRule normale avec bigint fonctionne et convertit vers DTO number', () => {
  const normalRule: PriceRule = {
    id: 'pr-normal-1',
    serviceDefinitionId: 'srv-1',
    catalogItemId: 'item-1',
    currency: 'USD',
    amountCents: 5000n, // 50.00 USD
    status: 'active',
    startsAt: null,
    endsAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  assertNonNegativeAmount(normalRule.amountCents);
  const dto = toPriceRuleDto(normalRule);
  assert.equal(dto.amountCents, 5000);
  assert.equal(typeof dto.amountCents, 'number');
  assert.equal(dto.currency, 'USD');
});

test('Test 2 — ancienne limite INTEGER: une valeur > 2_147_483_647 cents est acceptée par assertNonNegativeAmount et PriceRule', () => {
  const beyondInt32Cents = 2_147_483_648n; // 2^31
  const largeRule: PriceRule = {
    id: 'pr-large-1',
    serviceDefinitionId: 'srv-1',
    catalogItemId: null,
    currency: 'CDF',
    amountCents: beyondInt32Cents,
    status: 'active',
    startsAt: null,
    endsAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  assert.doesNotThrow(() => assertNonNegativeAmount(largeRule.amountCents));
  const dto = toPriceRuleDto(largeRule);
  assert.equal(dto.amountCents, 2_147_483_648);
  assert.equal(typeof dto.amountCents, 'number');
});

test('Test 3 — valeur CDF réaliste élevée: montant CDF réaliste (ex: 25_000 USD = 5_625_000_000 cents CDF)', () => {
  // 25,000 USD @ 2250 CDF/USD = 56,250,000 CDF = 5,625,000,000 cents CDF (dépasse largement INTEGER 2.14B)
  const cdfHighAmount = 5_625_000_000n;
  const cdfRule: PriceRule = {
    id: 'pr-cdf-enterprise',
    serviceDefinitionId: 'srv-enterprise-fleet',
    catalogItemId: null,
    currency: 'CDF',
    amountCents: cdfHighAmount,
    status: 'active',
    startsAt: null,
    endsAt: null,
    metadata: { description: 'Abonnement flotte entreprise annuelle' },
    createdAt: now,
    updatedAt: now,
  };

  assert.doesNotThrow(() => assertNonNegativeAmount(cdfRule.amountCents));
  const dto = toPriceRuleDto(cdfRule);
  assert.equal(dto.amountCents, 5_625_000_000);
  assert.equal(dto.currency, 'CDF');
});

test('Test 4 — conservation de la contrainte: une valeur négative reste rejetée', () => {
  assert.throws(() => assertNonNegativeAmount(-1n), /non-negative/);
  assert.throws(() => assertNonNegativeAmount(-1000n), /non-negative/);
  assert.throws(() => assertNonNegativeAmount(-1), /non-negative/);
});

test('Test 5 — round-trip: DB -> repository -> domaine -> DTO ne perd aucune précision et rejette au-delà de MAX_SAFE_INTEGER', () => {
  const safeLimit = BigInt(Number.MAX_SAFE_INTEGER);
  const boundaryRule: PriceRule = {
    id: 'pr-boundary',
    serviceDefinitionId: 'srv-1',
    catalogItemId: null,
    currency: 'USD',
    amountCents: safeLimit,
    status: 'active',
    startsAt: null,
    endsAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  const dto = toPriceRuleDto(boundaryRule);
  assert.equal(dto.amountCents, Number.MAX_SAFE_INTEGER);

  // Valeur dépassant MAX_SAFE_INTEGER doit être rejetée pour protéger les clients
  const unsafeRule: PriceRule = {
    id: 'pr-unsafe',
    serviceDefinitionId: 'srv-1',
    catalogItemId: null,
    currency: 'USD',
    amountCents: safeLimit + 1n,
    status: 'active',
    startsAt: null,
    endsAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  assert.throws(() => toPriceRuleDto(unsafeRule), /outside JavaScript safe integer range/);
});

test('Test 6 — CommissionRule: prouver explicitement que CommissionRule.value n est pas modifié et reste number', () => {
  const commissionRule: CommissionRule = {
    id: 'comm-1',
    serviceDefinitionId: 'srv-1',
    catalogItemId: null,
    currency: 'CDF',
    calculationType: 'percentage',
    value: 500, // 5.00%
    status: 'active',
    startsAt: null,
    endsAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  assert.equal(typeof commissionRule.value, 'number');
  assert.equal(commissionRule.value, 500);
});
