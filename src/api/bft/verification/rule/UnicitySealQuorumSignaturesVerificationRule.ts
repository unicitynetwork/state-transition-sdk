import { DataHash } from '../../../../crypto/hash/DataHash.js';
import { DataHasher } from '../../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../../crypto/hash/HashAlgorithm.js';
import { ISignatureVerifier } from '../../../../crypto/ISignatureVerifier.js';
import { Signature } from '../../../../crypto/secp256k1/Signature.js';
import { HexConverter } from '../../../../util/HexConverter.js';
import { VerificationResult } from '../../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../../verification/VerificationStatus.js';
import { RootTrustBase } from '../../RootTrustBase.js';
import { UnicitySeal } from '../../UnicitySeal.js';

/**
 * Rule to verify that the UnicitySeal contains valid quorum signatures.
 */
export class UnicitySealQuorumSignaturesVerificationRule {
  /**
   * Upper bound on memoised seals per trust base. Certifications made in one
   * batch land in a handful of adjacent aggregator rounds — measured on
   * testnet2, twenty inclusion proofs shared three seals — so a small cache
   * captures the clustering, while the bound stops a stream of distinct
   * (including invalid-but-well-formed) seals from growing it without limit.
   */
  private static readonly MAX_CACHED_SEALS = 256;

  /**
   * Seals that have already reached quorum, keyed by signature verifier and
   * then by the hashes of the trust base and of the seal's complete encoding.
   *
   * Every part of that key is load-bearing:
   *
   * 1. The seal key covers the signatures. {@link UnicitySeal.calculateHash}
   *    hashes the seal *without* them — it is the digest the root nodes sign —
   *    so keying on it would let a seal's valid signatures be swapped for
   *    garbage and still hit a cached OK. The key here is over `toCBOR()`,
   *    which encodes the signatures too, so a hit means byte-identical input.
   * 2. The trust base decides the outcome through its root nodes and quorum
   *    threshold, so it is keyed by *content*, not by instance identity:
   *    `RootTrustBase` exposes `_rootNodes` as a `Map`, and `readonly` stops
   *    only reassignment, so an application that mutates it in place would
   *    otherwise keep hitting verdicts computed under the old root keys.
   * 3. The verifier decides the outcome too, and verifiers are pluggable and
   *    need not agree — one that binds the recovery byte rejects signatures
   *    that one checking only `(r, s)` accepts. Keying on the verifier instance
   *    keeps a verdict from leaking across that boundary.
   *
   * Only quorum-reaching outcomes are stored: a failure is the abnormal path,
   * and not caching it keeps a flood of bad seals from evicting good entries.
   */
  private static readonly VERIFIED_SEALS = new WeakMap<
    ISignatureVerifier<Signature>,
    Map<string, VerificationResult<VerificationStatus>>
  >();

  /**
   * Verify the unicity seal carries a quorum of valid root-node signatures.
   *
   * Signature verification dominates inclusion-proof verification, and every
   * proof certified in the same aggregator round carries the same seal, so a
   * verified seal is memoised (see {@link VERIFIED_SEALS}).
   *
   * @param {RootTrustBase} trustBase Root trust base.
   * @param {ISignatureVerifier<Signature>} signatureVerifier Verifier for the root-node signatures.
   * @param {UnicitySeal} unicitySeal Seal to verify.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  public static async verify(
    trustBase: RootTrustBase,
    signatureVerifier: ISignatureVerifier<Signature>,
    unicitySeal: UnicitySeal,
  ): Promise<VerificationResult<VerificationStatus>> {
    const cacheKey = await UnicitySealQuorumSignaturesVerificationRule.cacheKeyFor(trustBase, unicitySeal);
    const cached = UnicitySealQuorumSignaturesVerificationRule.VERIFIED_SEALS.get(signatureVerifier)?.get(cacheKey);
    if (cached) {
      return cached;
    }

    const hash = await unicitySeal.calculateHash();

    const results = await Promise.all(
      Array.from(unicitySeal.signatures?.entries() ?? []).map(([nodeId, signature]) =>
        UnicitySealQuorumSignaturesVerificationRule.verifySignature(
          trustBase,
          signatureVerifier,
          nodeId,
          signature,
          hash,
        ),
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
      UnicitySealQuorumSignaturesVerificationRule.remember(signatureVerifier, cacheKey, result);

      return result;
    }

    return new VerificationResult(
      'UnicitySealQuorumSignaturesVerificationRule',
      VerificationStatus.FAIL,
      'Not enough unicity quorum signatures verification succeeded',
      results,
    );
  }

  /**
   * Build the content-addressed cache key for a (trust base, seal) pair.
   *
   * Both halves are hashed rather than referenced by identity so that mutating
   * either in place produces a different key — a miss — rather than a stale hit.
   *
   * @param {RootTrustBase} trustBase Trust base the seal is verified against.
   * @param {UnicitySeal} unicitySeal Seal being verified.
   * @returns {Promise<string>} Cache key.
   */
  private static async cacheKeyFor(trustBase: RootTrustBase, unicitySeal: UnicitySeal): Promise<string> {
    const [trustBaseHash, sealHash] = await Promise.all([
      new DataHasher(HashAlgorithm.SHA256)
        .update(new TextEncoder().encode(JSON.stringify(trustBase.toJSON())))
        .digest(),
      new DataHasher(HashAlgorithm.SHA256).update(unicitySeal.toCBOR()).digest(),
    ]);

    return `${HexConverter.encode(trustBaseHash.imprint)}:${HexConverter.encode(sealHash.imprint)}`;
  }

  /**
   * Store a quorum-reaching outcome, evicting the oldest entry once that
   * verifier's cache is full (`Map` iterates in insertion order).
   *
   * @param {ISignatureVerifier<Signature>} signatureVerifier Verifier that produced the outcome.
   * @param {string} cacheKey Combined trust-base and seal key.
   * @param {VerificationResult<VerificationStatus>} result Outcome to memoise.
   * @returns {void}
   */
  private static remember(
    signatureVerifier: ISignatureVerifier<Signature>,
    cacheKey: string,
    result: VerificationResult<VerificationStatus>,
  ): void {
    let seals = UnicitySealQuorumSignaturesVerificationRule.VERIFIED_SEALS.get(signatureVerifier);
    if (!seals) {
      seals = new Map();
      UnicitySealQuorumSignaturesVerificationRule.VERIFIED_SEALS.set(signatureVerifier, seals);
    }

    if (seals.size >= UnicitySealQuorumSignaturesVerificationRule.MAX_CACHED_SEALS) {
      const oldest = seals.keys().next();
      if (!oldest.done) {
        seals.delete(oldest.value);
      }
    }

    seals.set(cacheKey, result);
  }

  private static async verifySignature(
    trustBase: RootTrustBase,
    signatureVerifier: ISignatureVerifier<Signature>,
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

    const result = await signatureVerifier.verify(hash, signature, node.signingKey);
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
