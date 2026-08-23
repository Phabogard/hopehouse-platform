import { ValidationError } from '../../core/errors.js';

export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface AccountingAccountDefinition {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: AccountCategory;
  readonly currency?: string;
  readonly description: string;
}

const accounts: readonly AccountingAccountDefinition[] = [
  { id: 'cash-cdf', code: '1010', name: 'HopeHouse Treasury CDF', category: 'asset', currency: 'CDF', description: 'Treasury funds held in CDF.' },
  { id: 'cash-usd', code: '1020', name: 'HopeHouse Treasury USD', category: 'asset', currency: 'USD', description: 'Treasury funds held in USD.' },
  { id: 'mobile-money-cdf', code: '1030', name: 'Mobile Money Settlement CDF', category: 'asset', currency: 'CDF', description: 'CDF funds pending or held with mobile-money providers.' },
  { id: 'mobile-money-usd', code: '1040', name: 'Mobile Money Settlement USD', category: 'asset', currency: 'USD', description: 'USD funds pending or held with mobile-money providers.' },
  { id: 'wallet-cdf', code: '2010', name: 'Customer Wallet Liability CDF', category: 'liability', currency: 'CDF', description: 'CDF owed by HopeHouse to customers through wallets.' },
  { id: 'wallet-usd', code: '2020', name: 'Customer Wallet Liability USD', category: 'liability', currency: 'USD', description: 'USD owed by HopeHouse to customers through wallets.' },
  { id: 'fx-revenue-cdf', code: '4010', name: 'FX Conversion Revenue CDF', category: 'revenue', currency: 'CDF', description: 'Recognized FX conversion margin in CDF.' },
  { id: 'fx-revenue-usd', code: '4020', name: 'FX Conversion Revenue USD', category: 'revenue', currency: 'USD', description: 'Recognized FX conversion margin in USD.' },
  { id: 'mobile-money-fees-cdf', code: '5010', name: 'Mobile Money Fees CDF', category: 'expense', currency: 'CDF', description: 'Fees charged by mobile-money providers in CDF.' },
  { id: 'mobile-money-fees-usd', code: '5020', name: 'Mobile Money Fees USD', category: 'expense', currency: 'USD', description: 'Fees charged by mobile-money providers in USD.' },
];

export function getAccountingAccounts(): readonly AccountingAccountDefinition[] {
  return accounts;
}

export function getAccountingAccount(id: string): AccountingAccountDefinition {
  const account = accounts.find((candidate) => candidate.id === id);
  if (!account) throw new ValidationError(`Unknown accounting account: ${id}`);
  return account;
}
