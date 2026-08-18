import { secp256k1 } from '@noble/curves/secp256k1.js';

import { ISigningService } from '../ISigningService.js';
import { Signature } from './Signature.js';
import { areUint8ArraysEqual } from '../../util/TypedArrayUtils.js';
import { DataHash } from '../hash/DataHash.js';

/**
 * Default secp256k1 signing service. Wraps a 32-byte private key and exposes
 * the matching compressed public key, plus helpers for sign/verify and for
 * recovering a public key from a signature.
 *
 * @implements {ISigningService}
 */
export class SigningService implements ISigningService<Signature> {
  private readonly _publicKey: Uint8Array;

  public constructor(private readonly privateKey: Uint8Array) {
    this.privateKey = new Uint8Array(privateKey);
    this._publicKey = secp256k1.getPublicKey(this.privateKey, true);
  }

  /**
   * @returns {string} Algorithm name (`secp256k1`).
   */
  public get algorithm(): string {
    return 'secp256k1';
  }

  /**
   * @returns {Uint8Array} Copy of the compressed public key.
   */
  public get publicKey(): Uint8Array {
    return new Uint8Array(this._publicKey);
  }

  /**
   * Generate a signing service with a fresh random private key.
   *
   * @returns {SigningService} New signing service.
   */
  public static generate(): SigningService {
    return new SigningService(SigningService.generatePrivateKey());
  }

  /**
   * Generate a fresh random secp256k1 private key.
   *
   * @returns {Uint8Array} 32-byte private key.
   */
  public static generatePrivateKey(): Uint8Array {
    return secp256k1.utils.randomSecretKey();
  }

  /**
   * Check whether the given bytes form a valid compressed secp256k1 public key.
   *
   * @param {Uint8Array} publicKey Compressed public key bytes.
   * @returns {boolean} True if valid.
   */
  public static isPublicKeyValid(publicKey: Uint8Array): boolean {
    return secp256k1.utils.isValidPublicKey(publicKey, true);
  }

  /**
   * Verify secp256k1 signature against the given public key.
   *
   * @param {DataHash} hash Signed hash.
   * @param {Uint8Array} signature Compact signature bytes.
   * @param {Uint8Array} publicKey Compressed public key.
   * @returns {Promise<boolean>} True if the signature verifies.
   */
  public static verify(hash: DataHash, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
    return Promise.resolve(secp256k1.verify(signature, hash.data, publicKey, { format: 'compact', prehash: false }));
  }

  /**
   * Verify a recoverable signature against an expected public key.
   *
   * Unlike {@link verify}, this binds the signature's recovery byte: the
   * public key is recovered from the signature and must equal `publicKey`,
   * so a tampered recovery byte fails verification.
   *
   * @param {DataHash} hash Signed hash.
   * @param {Signature} signature Recoverable signature.
   * @param {Uint8Array} publicKey Expected compressed public key.
   * @returns {Promise<boolean>} True if the signature verifies and the
   *   recovered public key matches `publicKey`.
   */
  public static verifyWithPublicKey(hash: DataHash, signature: Signature, publicKey: Uint8Array): Promise<boolean> {
    const recovered = SigningService.recoverSignature(hash, signature);
    if (recovered === null || recovered.hasHighS) {
      return Promise.resolve(false);
    }

    return Promise.resolve(areUint8ArraysEqual(new Uint8Array(publicKey), recovered.publicKey));
  }

  /**
   * Recover the public key from the signature's recovery byte and verify the
   * signature against `hash`. The recovered key defines the signer's identity;
   * no expected key is supplied.
   *
   * @param {DataHash} hash Hash that was signed.
   * @param {Signature} signature Recoverable signature.
   * @returns {Promise<boolean>} True if the signature verifies.
   */
  public static verifyWithRecoveredPublicKey(hash: DataHash, signature: Signature): Promise<boolean> {
    const recovered = SigningService.recoverSignature(hash, signature);
    if (recovered === null) {
      return Promise.resolve(false);
    }

    return SigningService.verify(hash, signature.bytes, recovered.publicKey);
  }

  /**
   * Recover the compressed public key that produced `signature` over `hash`,
   * together with the signature's malleability flag, parsing the signature once.
   *
   * Key recovery is itself the validity check: the recovered key is by
   * construction the only key under which `(r, s)` verifies for `hash`, so a
   * caller that compares it against an expected key needs no second EC
   * verification. `hasHighS` is returned alongside because recovery — unlike
   * `secp256k1.verify`, which applies noble's default `lowS: true` policy —
   * accepts malleable signatures, so callers relying on recovery alone must
   * reject high-s themselves.
   *
   * @param {DataHash} hash Hash that was signed.
   * @param {Signature} signature Recoverable signature.
   * @returns {{ hasHighS: boolean; publicKey: Uint8Array }|null} Recovered public
   *   key and malleability flag, or `null` if the signature is not recoverable
   *   (e.g. `r`/`s` out of range).
   */
  private static recoverSignature(
    hash: DataHash,
    signature: Signature,
  ): { hasHighS: boolean; publicKey: Uint8Array } | null {
    try {
      const recoverable = secp256k1.Signature.fromBytes(
        new Uint8Array([signature.recovery, ...signature.bytes]),
        'recovered',
      );

      return { hasHighS: recoverable.hasHighS(), publicKey: recoverable.recoverPublicKey(hash.data).toBytes() };
    } catch {
      return null;
    }
  }

  /**
   * Sign a hash with this service's private key.
   *
   * @param {DataHash} hash Hash to sign.
   * @returns {Promise<Signature>} Recoverable signature.
   */
  public sign(hash: DataHash): Promise<Signature> {
    const signature = secp256k1.sign(hash.data, this.privateKey, { format: 'recovered', prehash: false });
    return Promise.resolve(new Signature(signature.slice(1), signature[0]));
  }

  /**
   * Verify a signature against this service's public key.
   *
   * @param {DataHash} hash Signed hash.
   * @param {Signature} signature Recoverable signature.
   * @returns {Promise<boolean>} True if the signature verifies.
   */
  public verify(hash: DataHash, signature: Signature): Promise<boolean> {
    return SigningService.verifyWithPublicKey(hash, signature, this._publicKey);
  }
}
