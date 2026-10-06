/**
 * Activation-code AES-GCM (AAD) unit tests + optional DB checks for reveal preconditions.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { decryptActivationCode, encryptActivationCode } from './activation-code.crypto';
import { issueActivationCode } from './activation-code';

const key = 'test-activation-code-encryption-key';

const codeId = randomUUID();
const plaintext = 'ABCD-EFGH-IJKL-MNOP';
const blob = encryptActivationCode(plaintext, key, codeId);
assert.match(blob, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
assert.equal(decryptActivationCode(blob, key, codeId), plaintext);

let aadFailed = false;
try {
  decryptActivationCode(blob, key, randomUUID());
} catch {
  aadFailed = true;
}
assert.equal(aadFailed, true, 'decrypt with swapped AAD must fail');

let keyFailed = false;
try {
  decryptActivationCode(blob, 'other-key-material', codeId);
} catch {
  keyFailed = true;
}
assert.equal(keyFailed, true, 'decrypt with wrong key must fail');

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('reveal-code.test.ts: unit ok; db skipped (unreachable)');
    await prisma.$disconnect();
    return;
  }

  const hasCipher = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ActivationCode' AND column_name = 'codeCiphertext'
    ) AS exists
  `;
  if (!hasCipher[0]?.exists) {
    console.log('reveal-code.test.ts: unit ok; db skipped (codeCiphertext not migrated)');
    await prisma.$disconnect();
    return;
  }

  const pepper = process.env.ACTIVATION_CODE_PEPPER ?? 'dev-activation-code-pepper-change-me';
  const encKey = process.env.ACTIVATION_CODE_ENCRYPTION_KEY ?? key;
  const issued = issueActivationCode(pepper);
  const activationCodeId = randomUUID();
  const subscriptionId = randomUUID();
  const ciphertext = encryptActivationCode(issued.plaintext, encKey, activationCodeId);

  try {
    await prisma.subscription.create({
      data: {
        id: subscriptionId,
        plan: 'STARTER',
        status: 'PENDING',
        maxUsers: 3,
        termMonths: 12,
        activationCodes: {
          create: {
            id: activationCodeId,
            codeHash: issued.codeHash,
            codePrefix: issued.codePrefix,
            codeCiphertext: ciphertext,
            expiresAt: issued.expiresAt,
          },
        },
      },
    });

    const row = await prisma.activationCode.findUniqueOrThrow({ where: { id: activationCodeId } });
    assert.ok(row.codeCiphertext);
    assert.equal(decryptActivationCode(row.codeCiphertext!, encKey, activationCodeId), issued.plaintext);

    // Simulate post-redeem / revoke ciphertext wipe (ciphertext cleared; hash retained)
    await prisma.activationCode.update({
      where: { id: activationCodeId },
      data: { codeCiphertext: null },
    });
    const after = await prisma.activationCode.findUniqueOrThrow({ where: { id: activationCodeId } });
    assert.equal(after.codeCiphertext, null);
  } finally {
    await prisma.activationCode.deleteMany({ where: { subscriptionId } }).catch(() => undefined);
    await prisma.subscriptionEvent.deleteMany({ where: { subscriptionId } }).catch(() => undefined);
    await prisma.subscription.deleteMany({ where: { id: subscriptionId } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log('reveal-code.test.ts: ok (unit + db)');
}

module.exports = main();
