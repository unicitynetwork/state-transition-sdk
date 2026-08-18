import { secp256k1 } from '@noble/curves/secp256k1.js';

import { DataHash } from '../../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../../src/crypto/hash/HashAlgorithm.js';
import { Signature } from '../../../../src/crypto/secp256k1/Signature.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';

const CURVE_ORDER = secp256k1.Point.Fn.ORDER;

/**
 * The malleable twin of a signature: `(r, n - s)` with the recovery bit
 * flipped. It recovers to the same public key as the original, so key recovery
 * alone cannot tell them apart — only a low-s check can.
 */
function malleableTwin(signature: Signature): Signature {
  const parsed = secp256k1.Signature.fromBytes(signature.bytes, 'compact');
  const twin = new secp256k1.Signature(parsed.r, CURVE_ORDER - parsed.s, signature.recovery ^ 1);

  return new Signature(twin.toBytes('compact'), twin.recovery as number);
}

describe('SigningService.verifyWithPublicKey', () => {
  const signingService = new SigningService(new Uint8Array(32).fill(0x0a));
  const otherKey = new SigningService(new Uint8Array(32).fill(0x0b)).publicKey;
  const hash = new DataHash(HashAlgorithm.SHA256, new Uint8Array(32).fill(0x0c));

  let signature: Signature;

  beforeAll(async () => {
    signature = await signingService.sign(hash);
  });

  it('accepts a genuine signature under the signing key', async () => {
    await expect(SigningService.verifyWithPublicKey(hash, signature, signingService.publicKey)).resolves.toBe(true);
  });

  it('rejects a genuine signature checked against a different key', async () => {
    await expect(SigningService.verifyWithPublicKey(hash, signature, otherKey)).resolves.toBe(false);
  });

  it('rejects a signature over a different hash', async () => {
    const otherHash = new DataHash(HashAlgorithm.SHA256, new Uint8Array(32).fill(0x0d));

    await expect(SigningService.verifyWithPublicKey(otherHash, signature, signingService.publicKey)).resolves.toBe(
      false,
    );
  });

  it('rejects a tampered recovery byte', async () => {
    const tampered = new Signature(signature.bytes, signature.recovery ^ 1);

    await expect(SigningService.verifyWithPublicKey(hash, tampered, signingService.publicKey)).resolves.toBe(false);
  });

  // Key recovery accepts high-s signatures; noble's verify (lowS: true by
  // default) did not. Verification here rests on recovery, so the low-s policy
  // has to be enforced explicitly or signatures become malleable.
  it('rejects the malleable high-s twin of a genuine signature', async () => {
    const twin = malleableTwin(signature);

    // The twin really is the same signature mathematically: it recovers to the
    // same key, which is exactly why recovery alone cannot reject it.
    expect(secp256k1.Signature.fromBytes(twin.bytes, 'compact').hasHighS()).toBe(true);
    expect(
      secp256k1.Signature.fromBytes(new Uint8Array([twin.recovery, ...twin.bytes]), 'recovered')
        .recoverPublicKey(hash.data)
        .toBytes(),
    ).toEqual(signingService.publicKey);

    await expect(SigningService.verifyWithPublicKey(hash, twin, signingService.publicKey)).resolves.toBe(false);
  });

  it('rejects a structurally invalid signature', async () => {
    const garbage = new Signature(new Uint8Array(64), 0);

    await expect(SigningService.verifyWithPublicKey(hash, garbage, signingService.publicKey)).resolves.toBe(false);
  });
});
