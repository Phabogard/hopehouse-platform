import assert from 'node:assert/strict';
import test from 'node:test';
import { createPayment } from '../src/modules/payments/payments.js';
import { createUser } from '../src/modules/users/users.js';

test('payment amounts cannot be negative', () => {
  assert.throws(() => createPayment({ beneficiaryId: 'BEN-001', amountCents: -1, currency: 'USD' }), /montant/);
});

test('user email is normalized', () => {
  const user = createUser({ email: 'ADMIN@HopeHouse.Local', displayName: 'Admin', role: 'system_admin' });
  assert.equal(user.email, 'admin@hopehouse.local');
  assert.equal(user.status, 'active');
});
