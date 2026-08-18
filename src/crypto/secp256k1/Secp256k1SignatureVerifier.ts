import { secp256k1 } from '@noble/curves/secp256k1.js';

import { Signature } from './Signature.js';
import { areUint8ArraysEqual } from '../../util/TypedArrayUtils.js';
import { DataHash } from '../hash/DataHash.js';
import { ISignatureVerifier } from '../ISignatureVerifier.js';

/**
 * secp256k1 signature verification.
 *
 * Verification here *is* key recovery: the key recovered from `(r, s)` and the
 * recovery byte over `hash` is by construction the only key under which the
 * signature verifies, so comparing it against the expected key both
 * authenticates the signature and binds the recovery byte — a tampered recovery
 * byte fails. That is one EC operation where recover-then-verify needs two.
 *
 * Recovery, unlike `secp256k1.verify` (noble applies `lowS: true` by default),
 * accepts malleable high-s signatures, so the low-s policy is applied
 * explicitly and behaviour is unchanged.
 */
export class Secp256k1SignatureVerifier implements ISignatureVerifier<Signature> {
  public readonly algorithm: string = 'secp256k1';

  /**
   * @inheritDoc
   */
  public verify(hash: DataHash, signature: Signature, publicKey: Uint8Array): Promise<boolean> {
    try {
      const recoverable = secp256k1.Signature.fromBytes(
        new Uint8Array([signature.recovery, ...signature.bytes]),
        'recovered',
      );
      if (recoverable.hasHighS()) {
        return Promise.resolve(false);
      }

      return Promise.resolve(
        areUint8ArraysEqual(new Uint8Array(publicKey), recoverable.recoverPublicKey(hash.data).toBytes()),
      );
    } catch {
      return Promise.resolve(false);
    }
  }
}
