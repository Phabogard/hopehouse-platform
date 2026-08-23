import { ValidationError } from '../../core/errors.js';

export interface FxRateSnapshot {
  readonly sourceCurrency: 'USD' | 'CDF';
  readonly destinationCurrency: 'USD' | 'CDF';
  readonly rateNumerator: bigint;
  readonly rateDenominator: bigint;
}

export interface FxConversionQuote {
  readonly sourceAmountMinor: bigint;
  readonly destinationAmountMinor: bigint;
  readonly rate: FxRateSnapshot;
}

export function quoteFxConversion(input: {
  sourceCurrency: 'USD' | 'CDF';
  destinationCurrency: 'USD' | 'CDF';
  sourceAmountMinor: bigint;
  rateNumerator: bigint;
  rateDenominator: bigint;
}): FxConversionQuote {
  if (input.sourceCurrency === input.destinationCurrency) {
    throw new ValidationError('FX conversion requires two different currencies');
  }
  if (input.sourceAmountMinor <= 0n) {
    throw new ValidationError('FX source amount must be positive');
  }
  if (input.rateNumerator <= 0n || input.rateDenominator <= 0n) {
    throw new ValidationError('FX rate must be positive');
  }

  const destinationAmountMinor =
    (input.sourceAmountMinor * input.rateNumerator) / input.rateDenominator;

  if (destinationAmountMinor <= 0n) {
    throw new ValidationError('FX destination amount rounds to zero');
  }

  return {
    sourceAmountMinor: input.sourceAmountMinor,
    destinationAmountMinor,
    rate: {
      sourceCurrency: input.sourceCurrency,
      destinationCurrency: input.destinationCurrency,
      rateNumerator: input.rateNumerator,
      rateDenominator: input.rateDenominator,
    },
  };
}
