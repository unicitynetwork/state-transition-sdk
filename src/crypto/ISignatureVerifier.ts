import type { DataHash } from './hash/DataHash.js';
import { ISignature } from './ISignature.js';

/**
 * Verifies signatures of type `T` against an expected public key.
 *
 * Kept separate from {@link ISigningService} so that verification — which
 * dominates token verification — can be swapped for another algorithm or a
 * faster implementation (native bindings, an HSM, batching) without touching
 * signing. The dependency direction is signing → verification, never the
 * reverse.
 *
 * @typeParam T Signature type this verifier consumes.
 */
export interface ISignatureVerifier<T extends ISignature> {
  readonly algorithm: string;

  /**
   * Verify `signature` over `hash` against `publicKey`.
   *
   * @param {DataHash} hash Signed hash.
   * @param {T} signature Signature to verify.
   * @param {Uint8Array} publicKey Expected public key.
   * @returns {Promise<boolean>} True if the signature verifies.
   */
  verify(hash: DataHash, signature: T, publicKey: Uint8Array): Promise<boolean>;
}
