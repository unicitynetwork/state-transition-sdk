import { DataHash } from '../../crypto/hash/DataHash.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';

/**
 * Verifier for predicates of one {@link PredicateEngine}. Given a predicate
 * and the unlock script for it, decides whether the spend is authorized.
 */
export interface IPredicateVerifier {
  /**
   * Engine this verifier handles.
   */
  get engine(): PredicateEngine;

  /**
   * Verify an unlock script against the predicate.
   */
  verify(
    encodedPredicate: IPredicate,
    referenceTime: bigint,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>>;
}
