import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';

/**
 * Bounded memo of seals that have already been verified.
 *
 * Every leaf certified in one aggregator round shares a seal, so a batch of
 * inclusion proofs re-verifies the same few seals — measured on testnet2,
 * twenty proofs shared three seals. Caching that pure result removes most of
 * the signature work from proof verification.
 *
 * The cache is supplied to {@link UnicitySealQuorumSignaturesVerificationRule}
 * by the caller rather than held statically, so its lifetime and size are the
 * application's to choose, and a rule constructed without one simply does not
 * memoise.
 *
 * Keys must commit to everything the verdict depends on — the rule builds them;
 * see its documentation for why the seal's signature-excluding hash is not
 * enough on its own.
 */
export class VerifiedSealCache {
  private readonly entries = new Map<string, VerificationResult<VerificationStatus>>();

  /**
   * @param {number} maxEntries Upper bound on retained entries; the oldest is evicted first.
   * @throws {Error} If `maxEntries` is not a positive integer.
   */
  public constructor(private readonly maxEntries: number) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error('VerifiedSealCache maxEntries must be a positive integer');
    }
  }

  /**
   * @param {string} key Cache key.
   * @returns {VerificationResult<VerificationStatus>|null} Memoised outcome, or null on a miss.
   */
  public get(key: string): VerificationResult<VerificationStatus> | null {
    return this.entries.get(key) ?? null;
  }

  /**
   * Store an outcome, evicting the oldest entry once full (`Map` iterates in
   * insertion order).
   *
   * @param {string} key Cache key.
   * @param {VerificationResult<VerificationStatus>} result Outcome to memoise.
   * @returns {void}
   */
  public set(key: string, result: VerificationResult<VerificationStatus>): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }

    this.entries.set(key, result);
  }
}
