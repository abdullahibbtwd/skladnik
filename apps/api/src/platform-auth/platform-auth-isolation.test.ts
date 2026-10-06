/**
 * Tenant and platform JWTs must not verify against each other's secret/audience.
 */
import assert from 'node:assert/strict';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import {
  PLATFORM_JWT_AUDIENCE,
  PLATFORM_JWT_ISSUER,
  TENANT_JWT_AUDIENCE,
} from './platform-auth.constants';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AUTH_REALM_KEY } from '../auth/decorators/auth-realm.decorator';
import { PlatformSubscriptionsController } from '../subscriptions/platform-subscriptions.controller';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotpCode,
  verifyTotpTimestep,
} from './totp.crypto';

const jwt = new JwtService({});
const TENANT_SECRET = 'tenant-access-secret-for-tests-only';
const PLATFORM_SECRET = 'platform-access-secret-for-tests-only';
const TOTP_KEY = 'platform-totp-encryption-key-for-tests';

async function signTenant(sub = 'tenant-user-1') {
  return jwt.signAsync(
    { sub, companyId: 'co-1', role: 'OWNER' },
    {
      secret: TENANT_SECRET,
      expiresIn: 60,
      issuer: PLATFORM_JWT_ISSUER,
      audience: TENANT_JWT_AUDIENCE,
    },
  );
}

async function signPlatform(sub = 'platform-admin-1') {
  return jwt.signAsync(
    { sub },
    {
      secret: PLATFORM_SECRET,
      expiresIn: 60,
      issuer: PLATFORM_JWT_ISSUER,
      audience: PLATFORM_JWT_AUDIENCE,
    },
  );
}

async function expectVerifyFail(
  token: string,
  opts: { secret: string; audience: string },
  label: string,
) {
  let failed = false;
  try {
    await jwt.verifyAsync(token, {
      secret: opts.secret,
      issuer: PLATFORM_JWT_ISSUER,
      audience: opts.audience,
    });
  } catch {
    failed = true;
  }
  assert.equal(failed, true, label);
}

async function main() {
  const tenantToken = await signTenant();
  const platformToken = await signPlatform();

  const tenantClaims = await jwt.verifyAsync(tenantToken, {
    secret: TENANT_SECRET,
    issuer: PLATFORM_JWT_ISSUER,
    audience: TENANT_JWT_AUDIENCE,
  });
  assert.equal(tenantClaims.sub, 'tenant-user-1');

  const platformClaims = await jwt.verifyAsync(platformToken, {
    secret: PLATFORM_SECRET,
    issuer: PLATFORM_JWT_ISSUER,
    audience: PLATFORM_JWT_AUDIENCE,
  });
  assert.equal(platformClaims.sub, 'platform-admin-1');

  await expectVerifyFail(
    tenantToken,
    { secret: PLATFORM_SECRET, audience: PLATFORM_JWT_AUDIENCE },
    'tenant token must not verify as platform',
  );
  await expectVerifyFail(
    platformToken,
    { secret: TENANT_SECRET, audience: TENANT_JWT_AUDIENCE },
    'platform token must not verify as tenant',
  );

  await expectVerifyFail(
    tenantToken,
    { secret: TENANT_SECRET, audience: PLATFORM_JWT_AUDIENCE },
    'tenant token rejected with platform audience',
  );
  await expectVerifyFail(
    platformToken,
    { secret: PLATFORM_SECRET, audience: TENANT_JWT_AUDIENCE },
    'platform token rejected with tenant audience',
  );

  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret, TOTP_KEY);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptTotpSecret(encrypted, TOTP_KEY), secret);
  const code = authenticator.generate(secret);
  assert.equal(verifyTotpCode(code, secret), true);
  assert.equal(verifyTotpCode('000000', secret), false);
  const timestep = verifyTotpTimestep(code, secret);
  assert.equal(typeof timestep, 'number');
  assert.equal(verifyTotpTimestep('000000', secret), null);

  // Platform invoice / reveal / transition routes must stay @Platform (tenant JWTs never satisfy PlatformGuard).
  const classRealm = Reflect.getMetadata(AUTH_REALM_KEY, PlatformSubscriptionsController) as string;
  assert.equal(classRealm, 'platform');
  const proto = PlatformSubscriptionsController.prototype as Record<string, unknown>;
  for (const key of [
    'transition',
    'revealCode',
    'markInvoicePaid',
    'voidInvoice',
    'downloadInvoicePdf',
    'create',
  ]) {
    const handler = proto[key];
    assert.equal(typeof handler, 'function', `missing handler ${key}`);
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    assert.notEqual(method, undefined, `${key} must be an HTTP handler`);
    const realm =
      (Reflect.getMetadata(AUTH_REALM_KEY, handler) as string | undefined) ?? classRealm;
    assert.equal(realm, 'platform', `${key} must be platform-realm`);
    const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
    assert.ok(path !== undefined, `${key} route path`);
  }

  console.log('platform-auth-isolation.test.ts: ok');
}

export default main();
