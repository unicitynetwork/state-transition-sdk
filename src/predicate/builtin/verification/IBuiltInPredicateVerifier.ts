import { DataHash } from '../../../crypto/hash/DataHash.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { EncodedPredicate } from '../../EncodedPredicate.js';
import { BuiltInPredicateType } from '../BuiltInPredicateType.js';

/**
 * Verifier for a single {@link BuiltInPredicateType}. Plugged into
 * {@link DefaultBuiltInPredicateVerifier} which dispatches by type id.
 */
export interface IBuiltInPredicateVerifier {
  /**
   * Built-in predicate type this verifier handles.
   */
  get type(): BuiltInPredicateType;

  /**
   * Verify an unlock script against the predicate.
   *
   * @param {EncodedPredicate} predicate Predicate being unlocked.
   * @param {bigint} referenceTime Reference time the transition was validated under, in Unix seconds.
   * @param {DataHash} sourceStateHash Hash of the state being spent.
   * @param {DataHash} transactionHash Hash of the spending transaction.
   * @param {Uint8Array} unlockScript Witness bytes for the predicate.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  verify(
    predicate: EncodedPredicate,
    referenceTime: bigint,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>>;
}
