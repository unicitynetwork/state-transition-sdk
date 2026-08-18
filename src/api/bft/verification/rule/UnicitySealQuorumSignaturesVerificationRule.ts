import { DataHash } from '../../../../crypto/hash/DataHash.js';
import { DataHasher } from '../../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../../crypto/hash/HashAlgorithm.js';
import { ISignatureVerifier } from '../../../../crypto/ISignatureVerifier.js';
import { Signature } from '../../../../crypto/secp256k1/Signature.js';
import { CborSerializer } from '../../../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../util/HexConverter.js';
import { VerificationResult } from '../../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../../verification/VerificationStatus.js';
import { RootTrustBase } from '../../RootTrustBase.js';
import { UnicitySeal } from '../../UnicitySeal.js';
import { VerifiedSealCache } from '../VerifiedSealCache.js';

/**
 * Rule to verify that the UnicitySeal contains valid quorum signatures.
 *
 * Signature verification dominates inclusion-proof verification, and every proof
 * certified in the same aggregator round carries the same seal, so the rule can
 * memoise verified seals in a caller-supplied {@link VerifiedSealCache}.
 */
export class UnicitySealQuorumSignaturesVerificationRule {
  /**
   * @param {ISignatureVerifier<Signature>} signatureVerifier Verifier for the root-node signatures.
   * @param {VerifiedSealCache} [cache] Memo for verified seals; omit to verify every seal afresh.
   */
  public constructor(
    private readonly signatureVerifier: ISignatureVerifier<Signature>,
    private readonly cache?: VerifiedSealCache,
  ) {}

  /**
   * Build the cache key for a (trust base, seal) pair.
   *
   * Both halves are addressed by content, and both are load-bearing:
   *
   * 1. The seal is keyed on its **complete** encoding.
   *    {@link UnicitySeal.calculateHash} hashes it *without* the signatures — it
   *    is the digest the root nodes sign — so keying on that would let a seal's
   *    valid signatures be swapped for garbage and still hit a cached OK.
   *    `toCBOR()` encodes the signatures too, so a hit means identical bytes.
   * 2. The trust base decides the outcome through its root nodes and quorum
   *    threshold, and is keyed by content rather than identity because
   *    `RootTrustBase` exposes `_rootNodes` as a `Map`: `readonly` stops only
   *    reassignment, so an in-place edit would otherwise keep hitting verdicts
   *    computed under the old root keys.
   *
   * The signature verifier needs no representation here: a cache is reachable
   * only through the rule that owns it, and a rule owns exactly one verifier.
   *
   * Both are folded into a single digest through a CBOR array: the framing is
   * what makes one hash safe, since concatenating two variable-length encodings
   * raw would let a different (trust base, seal) split produce the same bytes.
   *
   * @param {RootTrustBase} trustBase Trust base the seal is verified against.
   * @param {UnicitySeal} unicitySeal Seal being verified.
   * @returns {Promise<string>} Cache key.
   */
  private static async cacheKeyFor(trustBase: RootTrustBase, unicitySeal: UnicitySeal): Promise<string> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeTextString(JSON.stringify(trustBase.toJSON())),
          CborSerializer.encodeByteString(unicitySeal.toCBOR()),
        ),
      )
      .digest();

    return HexConverter.encode(hash.imprint);
  }

  /**
   * Verify the unicity seal carries a quorum of valid root-node signatures.
   *
   * @param {RootTrustBase} trustBase Root trust base.
   * @param {UnicitySeal} unicitySeal Seal to verify.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  public async verify(
    trustBase: RootTrustBase,
    unicitySeal: UnicitySeal,
  ): Promise<VerificationResult<VerificationStatus>> {
    const cacheKey = this.cache
      ? await UnicitySealQuorumSignaturesVerificationRule.cacheKeyFor(trustBase, unicitySeal)
      : null;
    if (cacheKey !== null) {
      const cached = this.cache?.get(cacheKey) ?? null;
      if (cached !== null) {
        return cached;
      }
    }

    const hash = await unicitySeal.calculateHash();

    const results = await Promise.all(
      Array.from(unicitySeal.signatures?.entries() ?? []).map(([nodeId, signature]) =>
        this.verifySignature(trustBase, nodeId, signature, hash),
      ),
    );

    const successful = results.reduce(
      (previousValue, currentValue) =>
        currentValue.status === VerificationStatus.OK ? previousValue + 1 : previousValue,
      0,
    );
    if (successful >= trustBase.quorumThreshold) {
      const result = new VerificationResult(
        'UnicitySealQuorumSignaturesVerificationRule',
        VerificationStatus.OK,
        'Unicity quorum signatures verification threshold reached',
        results,
      );
      // Only quorum-reaching outcomes are memoised: a failure is the abnormal
      // path, and not caching it keeps a flood of bad seals from evicting good
      // entries.
      if (cacheKey !== null) {
        this.cache?.set(cacheKey, result);
      }

      return result;
    }

    return new VerificationResult(
      'UnicitySealQuorumSignaturesVerificationRule',
      VerificationStatus.FAIL,
      'Not enough unicity quorum signatures verification succeeded',
      results,
    );
  }

  private async verifySignature(
    trustBase: RootTrustBase,
    nodeId: string,
    signature: Signature,
    hash: DataHash,
  ): Promise<VerificationResult<VerificationStatus>> {
    const node = trustBase.rootNodes.get(nodeId) ?? null;
    if (node == null) {
      return new VerificationResult(
        `SignatureVerificationRule[${nodeId}]`,
        VerificationStatus.FAIL,
        'No root node defined',
      );
    }

    const result = await this.signatureVerifier.verify(hash, signature, node.signingKey);
    if (!result) {
      return new VerificationResult(
        `SignatureVerificationRule[${nodeId}]`,
        VerificationStatus.FAIL,
        'Signature verification failed',
      );
    }

    return new VerificationResult(`SignatureVerificationRule[${nodeId}]`, VerificationStatus.OK);
  }
}
