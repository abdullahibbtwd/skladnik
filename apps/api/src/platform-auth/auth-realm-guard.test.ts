/**
 * Unit checks for AuthRealmGuard default-deny.
 */
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_REALM_KEY } from '../auth/decorators/auth-realm.decorator';
import { AuthRealmGuard } from '../auth/guards/auth-realm.guard';

function contextWithRealm(realm: string | undefined) {
  const reflector = {
    getAllAndOverride: (_key: string) => realm,
  } as unknown as Reflector;
  const guard = new AuthRealmGuard(reflector);
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
  return { guard, context };
}

{
  const { guard, context } = contextWithRealm(undefined);
  let threw: unknown;
  try {
    guard.canActivate(context);
  } catch (error) {
    threw = error;
  }
  assert.ok(threw instanceof ForbiddenException, 'unmarked route is forbidden');
  const body = (threw as ForbiddenException).getResponse() as { code?: string };
  assert.equal(body.code, 'ROUTE_UNCLASSIFIED');
}

for (const realm of ['public', 'tenant', 'platform'] as const) {
  const { guard, context } = contextWithRealm(realm);
  assert.equal(guard.canActivate(context), true, `${realm} allowed`);
}

assert.equal(AUTH_REALM_KEY, 'authRealm');

console.log('auth-realm-guard.test.ts: ok');
