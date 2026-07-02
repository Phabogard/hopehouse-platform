import assert from 'node:assert/strict';
import test from 'node:test';
import { createBeneficiary } from '../src/modules/beneficiaries/beneficiaries.js';
import { createInvoice } from '../src/modules/invoices/invoices.js';
import { createPayment } from '../src/modules/payments/payments.js';
import { createServiceOffering } from '../src/modules/services/services.js';
import { createSubscription } from '../src/modules/subscriptions/subscriptions.js';
import { createUser } from '../src/modules/users/users.js';

test('user creation normalizes email and creates an active user', () => {
  const user = createUser({ email: 'ADMIN@HopeHouse.Local', displayName: ' Admin ', role: 'system_admin' });

  assert.equal(user.email, 'admin@hopehouse.local');
  assert.equal(user.displayName, 'Admin');
  assert.equal(user.status, 'active');
  assert.equal(user.role, 'system_admin');
});

test('user creation rejects invalid email and missing display name', () => {
  assert.throws(() => createUser({ email: 'invalid-email', displayName: 'Admin', role: 'system_admin' }), /e-mail/);
  assert.throws(() => createUser({ email: 'admin@hopehouse.local', displayName: ' ', role: 'system_admin' }), /nom affiché/);
});

test('beneficiary creation trims fields and creates an active beneficiary', () => {
  const beneficiary = createBeneficiary({ reference: ' BEN-001 ', displayName: ' Bénéficiaire Test ' });

  assert.equal(beneficiary.reference, 'BEN-001');
  assert.equal(beneficiary.displayName, 'Bénéficiaire Test');
  assert.equal(beneficiary.status, 'active');
});

test('beneficiary creation rejects missing reference and display name', () => {
  assert.throws(() => createBeneficiary({ reference: ' ', displayName: 'Bénéficiaire Test' }), /référence bénéficiaire/);
  assert.throws(() => createBeneficiary({ reference: 'BEN-001', displayName: ' ' }), /nom du bénéficiaire/);
});

test('service offering creation trims optional description and starts as draft', () => {
  const service = createServiceOffering({ name: ' Hébergement ', description: ' Service résidentiel ', isBillable: true });

  assert.equal(service.name, 'Hébergement');
  assert.equal(service.description, 'Service résidentiel');
  assert.equal(service.status, 'draft');
  assert.equal(service.isBillable, true);
});

test('service offering creation rejects missing service name', () => {
  assert.throws(() => createServiceOffering({ name: ' ', isBillable: false }), /nom du service/);
});

test('subscription creation links beneficiary and service as a draft subscription', () => {
  const subscription = createSubscription({ beneficiaryId: 'BEN-001', serviceId: 'SVC-001', startDate: '2026-01-01', endDate: '2026-12-31' });

  assert.equal(subscription.beneficiaryId, 'BEN-001');
  assert.equal(subscription.serviceId, 'SVC-001');
  assert.equal(subscription.status, 'draft');
  assert.equal(subscription.startDate, '2026-01-01');
  assert.equal(subscription.endDate, '2026-12-31');
});

test('subscription creation rejects missing beneficiary, service, and start date', () => {
  assert.throws(() => createSubscription({ beneficiaryId: '', serviceId: 'SVC-001', startDate: '2026-01-01' }), /bénéficiaire/);
  assert.throws(() => createSubscription({ beneficiaryId: 'BEN-001', serviceId: '', startDate: '2026-01-01' }), /service/);
  assert.throws(() => createSubscription({ beneficiaryId: 'BEN-001', serviceId: 'SVC-001', startDate: '' }), /date de début/);
});

test('payment creation normalizes currency and starts as initiated', () => {
  const payment = createPayment({ beneficiaryId: 'BEN-001', amountCents: 0, currency: 'usd', paymentMethod: 'manual' });

  assert.equal(payment.beneficiaryId, 'BEN-001');
  assert.equal(payment.amountCents, 0);
  assert.equal(payment.currency, 'USD');
  assert.equal(payment.paymentMethod, 'manual');
  assert.equal(payment.status, 'initiated');
});

test('payment creation rejects invalid beneficiary, amount, and currency', () => {
  assert.throws(() => createPayment({ beneficiaryId: '', amountCents: 100, currency: 'USD' }), /bénéficiaire/);
  assert.throws(() => createPayment({ beneficiaryId: 'BEN-001', amountCents: -1, currency: 'USD' }), /montant/);
  assert.throws(() => createPayment({ beneficiaryId: 'BEN-001', amountCents: 10.5, currency: 'USD' }), /montant/);
  assert.throws(() => createPayment({ beneficiaryId: 'BEN-001', amountCents: 100, currency: 'US' }), /devise/);
});

test('invoice creation normalizes currency and starts as draft without invoice number', () => {
  const invoice = createInvoice({ beneficiaryId: 'BEN-001', totalCents: 0, currency: 'usd' });

  assert.equal(invoice.beneficiaryId, 'BEN-001');
  assert.equal(invoice.totalCents, 0);
  assert.equal(invoice.currency, 'USD');
  assert.equal(invoice.status, 'draft');
  assert.equal(invoice.invoiceNumber, null);
  assert.equal(invoice.issuedAt, null);
});

test('invoice creation rejects invalid beneficiary, total, and currency', () => {
  assert.throws(() => createInvoice({ beneficiaryId: '', totalCents: 100, currency: 'USD' }), /bénéficiaire/);
  assert.throws(() => createInvoice({ beneficiaryId: 'BEN-001', totalCents: -1, currency: 'USD' }), /total de facture/);
  assert.throws(() => createInvoice({ beneficiaryId: 'BEN-001', totalCents: 10.5, currency: 'USD' }), /total de facture/);
  assert.throws(() => createInvoice({ beneficiaryId: 'BEN-001', totalCents: 100, currency: 'US' }), /devise/);
});
