import { describe, expect, it } from 'vitest';
import { quoteFxConversion } from '../src/modules/accounting/fx-policy.js';

describe('FX policy', () => {
  it('quotes USD to CDF with an integer rate', () => {
    const quote = quoteFxConversion({
      sourceCurrency: 'USD',
      destinationCurrency: 'CDF',
      sourceAmountMinor: 100n,
      rateNumerator: 2250n,
      rateDenominator: 1n,
    });

    expect(quote.destinationAmountMinor).toBe(225000n);
    expect(quote.rate.rateNumerator).toBe(2250n);
  });

  it('quotes CDF to USD using the configured inverse-direction rate', () => {
    const quote = quoteFxConversion({
      sourceCurrency: 'CDF',
      destinationCurrency: 'USD',
      sourceAmountMinor: 235000n,
      rateNumerator: 1n,
      rateDenominator: 2350n,
    });

    expect(quote.destinationAmountMinor).toBe(100n);
  });

  it('rejects same-currency conversions', () => {
    expect(() => quoteFxConversion({
      sourceCurrency: 'USD',
      destinationCurrency: 'USD',
      sourceAmountMinor: 100n,
      rateNumerator: 1n,
      rateDenominator: 1n,
    })).toThrow('two different currencies');
  });

  it('rejects a conversion that rounds to zero', () => {
    expect(() => quoteFxConversion({
      sourceCurrency: 'CDF',
      destinationCurrency: 'USD',
      sourceAmountMinor: 1n,
      rateNumerator: 1n,
      rateDenominator: 2350n,
    })).toThrow('rounds to zero');
  });
});
