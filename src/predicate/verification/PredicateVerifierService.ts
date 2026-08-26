import { IPredicateVerifier } from './IPredicateVerifier.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { DefaultBuiltInPredicateVerifier } from '../builtin/DefaultBuiltInPredicateVerifier.js';
import { EncodedPredicate } from '../EncodedPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';

/**
 * Registry that dispatches predicate verification to the right
 * {@link IPredicateVerifier} based on the predicate's engine.
 */
export class PredicateVerifierService {
  private readonly verifiers: Map<PredicateEngine, IPredicateVerifier> = new Map();

  private constructor() {}

  /**
   * Create verifier service with default verifiers.
   *
   * @returns {PredicateVerifierService} Service with the default verifiers registered.
   */
  public static create(): PredicateVerifierService {
    const verifier = new PredicateVerifierService();
    verifier.addVerifier(DefaultBuiltInPredicateVerifier.create());

    return verifier;
  }

  /**
   * Register a verifier for its declared engine.
   *
   * @param {IPredicateVerifier} verifier Verifier to register.
   * @returns {PredicateVerifierService} This service for chaining.
   * @throws {Error} If a verifier is already registered for the engine.
   */
  public addVerifier(verifier: IPredicateVerifier): this {
    if (this.verifiers.has(verifier.engine)) {
      throw new Error(`Found duplicate predicate verifier for engine ${verifier.engine}.`);
    }

    this.verifiers.set(verifier.engine, verifier);

    return this;
  }

  /**
   * Verify given predicate with registered predicate verifiers.
   *
   * @param {EncodedPredicate} predicate Predicate being unlocked.
   * @param {bigint} referenceTime Reference time the transition was validated under, in Unix seconds.
   * @param {DataHash} sourceStateHash Hash of the state being spent.
   * @param {DataHash} transactionHash Hash of the spending transaction.
   * @param {Uint8Array} unlockScript Witness bytes for the predicate.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   * @throws {Error} If no verifier is registered for the predicate's engine.
   */
  public verify(
    predicate: EncodedPredicate,
    referenceTime: bigint,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const verifier = this.verifiers.get(predicate.engine);
    if (!verifier) {
      throw new Error('Unsupported predicate engine.');
    }

    return verifier.verify(predicate, referenceTime, sourceStateHash, transactionHash, unlockScript);
  }
}
