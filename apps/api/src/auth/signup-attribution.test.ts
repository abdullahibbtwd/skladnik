/**
 * Signup / Google auth DTOs accept optional first-touch attribution fields.
 */
import assert from 'node:assert/strict';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SignupDto } from './dto/signup.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';

function validSignup(extra: Record<string, unknown> = {}) {
  return plainToInstance(SignupDto, {
    email: 'owner@example.com',
    password: 'password1',
    name: 'Owner',
    companyName: 'Cafe Demo',
    ...extra,
  });
}

{
  const errors = validateSync(
    validSignup({
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'spring',
      referrer: 'https://example.com/landing',
    }),
  );
  assert.equal(errors.length, 0);
}

{
  const errors = validateSync(validSignup({ utmSource: 'x'.repeat(201) }));
  assert.ok(errors.some((e) => e.property === 'utmSource'));
}

{
  const errors = validateSync(validSignup({ referrer: 'y'.repeat(501) }));
  assert.ok(errors.some((e) => e.property === 'referrer'));
}

{
  const errors = validateSync(
    plainToInstance(GoogleAuthDto, {
      credential: 'x'.repeat(40),
      utmSource: 'newsletter',
      referrer: 'https://ref.example/',
    }),
  );
  assert.equal(errors.length, 0);
}

console.log('signup-attribution.test.ts: ok');
