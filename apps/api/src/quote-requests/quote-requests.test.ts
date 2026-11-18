/**
 * Quote request validation, honeypot discard, and persistence (mocked Prisma/queue).
 */
import assert from 'node:assert/strict';
import { isEmailOrPhoneContact } from '@skladnik/shared';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto';
import { QuoteRequestsService } from './quote-requests.service';

assert.equal(isEmailOrPhoneContact('owner@shop.bg'), true);
assert.equal(isEmailOrPhoneContact('+359888123456'), true);
assert.equal(isEmailOrPhoneContact('123'), false);
assert.equal(isEmailOrPhoneContact('not-an-email'), false);

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateQuoteRequestDto, plain);
  return validate(dto);
}

export default (async () => {
  {
    const errors = await validateDto({
      name: 'Ada',
      businessType: 'Grocery',
      locations: 2,
      contact: 'ada@shop.bg',
    });
    assert.equal(errors.length, 0);
  }

  {
    const errors = await validateDto({
      name: 'Ada',
      businessType: 'Grocery',
      locations: 2,
      contact: 'nope',
    });
    assert.ok(errors.some((error) => error.property === 'contact'));
  }

  {
    const errors = await validateDto({
      name: 'Ada',
      businessType: 'Grocery',
      locations: 0,
      contact: 'ada@shop.bg',
    });
    assert.ok(errors.some((error) => error.property === 'locations'));
  }

  // Honeypot filled → discarded, no DB write.
  {
    let creates = 0;
    let queueAdds = 0;
    const prisma = {
      quoteRequest: {
        create: async () => {
          creates += 1;
          return { id: 'q1' };
        },
      },
    };
    const queue = {
      add: async () => {
        queueAdds += 1;
      },
    };
    const service = new QuoteRequestsService(prisma as never, queue as never);
    const result = await service.create({
      name: 'Bot',
      businessType: 'Spam',
      locations: 1,
      contact: 'bot@spam.test',
      website: 'https://spam.example',
    });
    assert.deepEqual(result, { ok: true, discarded: true });
    assert.equal(creates, 0);
    assert.equal(queueAdds, 0);
  }

  // Valid lead is persisted even if enqueue fails.
  {
    let creates = 0;
    const prisma = {
      quoteRequest: {
        create: async (args: { data: { name: string; contact: string } }) => {
          creates += 1;
          assert.equal(args.data.name, 'Olga');
          assert.equal(args.data.contact, '+359888000111');
          return { id: 'q-ok' };
        },
      },
    };
    const queue = {
      add: async () => {
        throw new Error('Redis down');
      },
    };
    const service = new QuoteRequestsService(prisma as never, queue as never);
    const result = await service.create({
      name: 'Olga',
      businessType: 'Café',
      locations: 3,
      contact: '+359888000111',
      locale: 'bg',
      utmSource: 'newsletter',
    });
    assert.deepEqual(result, { ok: true, id: 'q-ok' });
    assert.equal(creates, 1);
  }

  console.log('quote-requests.test.ts: ok');
})();
