import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaOrderRepository } from '../src/infrastructure/prisma/order-repository.js';

test('PrismaOrderRepository deep-freezes persisted order metadata without freezing the database-shaped input', async () => {
  const metadata = {
    pricing: {
      ruleId: 'price-1',
      amountCents: 500000,
      context: { channel: 'mobile' },
    },
  };

  const client = {
    order: {
      async findUnique() {
        return {
          id: 'order-1',
          orderNumber: 'order-1',
          currentStep: 'creation',
          serviceDefinitionId: 'service-1',
          catalogItemId: 'item-1',
          mode: 'manual',
          requesterActorId: 'actor-1',
          beneficiaryId: null,
          channel: 'mobile',
          amountCents: 500000n,
          currency: 'CDF',
          metadataJson: metadata,
          createdAt: new Date('2026-09-28T12:00:00.000Z'),
          updatedAt: new Date('2026-09-28T12:00:00.000Z'),
          transitions: [],
        };
      },
    },
  } as any;

  const repository = new PrismaOrderRepository(client);
  const order = await repository.getById('order-1');
  assert.ok(order);

  const pricing = order.metadata.pricing as Record<string, unknown>;
  const context = pricing.context as Record<string, unknown>;

  assert.equal(Object.isFrozen(pricing), true);
  assert.equal(Object.isFrozen(context), true);
  assert.throws(() => { pricing.amountCents = 1; }, TypeError);
  assert.throws(() => { context.channel = 'other'; }, TypeError);

  assert.equal(metadata.pricing.amountCents, 500000);
  assert.equal(metadata.pricing.context.channel, 'mobile');
  assert.equal(Object.isFrozen(metadata.pricing), false);
});
