import { ShardIdMatchesStateIdRule } from './ShardIdMatchesStateIdRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { UnicityCertificateVerifier } from '../../../api/bft/verification/UnicityCertificateVerifier.js';
import { InclusionProof } from '../../../api/InclusionProof.js';
import { calculateLeafValue } from '../../../api/LeafValue.js';
import { StateId } from '../../../api/StateId.js';
import { DataHash } from '../../../crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../crypto/hash/HashAlgorithm.js';
import { EncodedPredicate } from '../../../predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../../../predicate/verification/PredicateVerifierService.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';

/**
 * Status codes for verifying an InclusionProof.
 */
export enum InclusionProofVerificationStatus {
  INVALID_TRUSTBASE = 'INVALID_TRUSTBASE',
  CERTIFICATION_DATA_MISMATCH = 'CERTIFICATION_DATA_MISMATCH',
  TRANSACTION_HASH_MISMATCH = 'TRANSACTION_HASH_MISMATCH',
  REFERENCE_TIME_AFTER_ROUND = 'REFERENCE_TIME_AFTER_ROUND',
  REQUEST_EXPIRED = 'REQUEST_EXPIRED',
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  PATH_INVALID = 'PATH_INVALID',
  SHARD_ID_MISMATCH = 'SHARD_ID_MISMATCH',
  OK = 'OK',
}

/**
 * Genesis verification rule.
 */
export class InclusionProofVerificationRule {
  /**
   * Verify an inclusion proof for a transaction, given the transaction data the proof
   * attests to: its canonical hash, the lock script being unlocked, and the source state
   * being spent.
   *
   * @param {RootTrustBase} trustBase Root trust base.
   * @param {PredicateVerifierService} predicateVerifierFactory Predicate verifier service.
   * @param {InclusionProof} inclusionProof Inclusion proof to verify.
   * @param {DataHash} transactionHash Canonical hash of the transaction.
   * @param {bigint|null} expiresAt Exclusive request deadline in Unix seconds, or `null` when the service assigned one.
   * @param {EncodedPredicate} lockScript Lock script the transaction unlocks.
   * @param {DataHash} sourceStateHash Hash of the state the transaction spends.
   * @returns {Promise<VerificationResult<InclusionProofVerificationStatus>>} Verification outcome.
   */
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifierFactory: PredicateVerifierService,
    unicityCertificateVerifier: UnicityCertificateVerifier,
    inclusionProof: InclusionProof,
    transactionHash: DataHash,
    expiresAt: bigint | null,
    lockScript: EncodedPredicate,
    sourceStateHash: DataHash,
  ): Promise<VerificationResult<InclusionProofVerificationStatus>> {
    const { certificationData, referenceTime } = inclusionProof;

    if (!certificationData.transactionHash.equals(transactionHash)) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.TRANSACTION_HASH_MISMATCH,
      );
    }

    if (
      !EncodedPredicate.equals(certificationData.lockScript, lockScript) ||
      !certificationData.sourceStateHash.equals(sourceStateHash) ||
      certificationData.expiresAt !== expiresAt
    ) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.CERTIFICATION_DATA_MISMATCH,
      );
    }

    // Admissible only in a round strictly below the deadline. A request without one was admitted
    // under a service-assigned deadline, which is not recorded and not re-checked here.
    if (expiresAt != null && referenceTime >= expiresAt) {
      return new VerificationResult('InclusionProofVerificationRule', InclusionProofVerificationStatus.REQUEST_EXPIRED);
    }

    // A leaf cannot postdate the round that certified it, and consensus signs that timestamp.
    // One-sided: it does not detect back-dating. See README.md, "Request deadlines are enforced by
    // the service, not by verification".
    if (referenceTime > inclusionProof.unicityCertificate.inputRecord.timestamp) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.REFERENCE_TIME_AFTER_ROUND,
      );
    }

    const stateId = await StateId.fromCertificationData(certificationData);
    const leafValue = await calculateLeafValue(certificationData.transactionHash, referenceTime);
    const result = await inclusionProof.inclusionCertificate.verify(
      stateId,
      leafValue,
      new DataHash(HashAlgorithm.SHA256, inclusionProof.unicityCertificate.inputRecord.hash),
    );
    if (!result) {
      return new VerificationResult('InclusionProofVerificationRule', InclusionProofVerificationStatus.PATH_INVALID);
    }

    const shardResult = ShardIdMatchesStateIdRule.verify(
      stateId,
      inclusionProof.unicityCertificate.shardTreeCertificate,
    );
    if (shardResult.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.SHARD_ID_MISMATCH,
        '',
        [shardResult],
      );
    }

    const unicityCertificateVerificationResult = await unicityCertificateVerifier.verify(trustBase, inclusionProof);

    if (unicityCertificateVerificationResult.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.INVALID_TRUSTBASE,
        '',
        [unicityCertificateVerificationResult],
      );
    }

    const predicateVerificationResult = await predicateVerifierFactory.verify(
      lockScript,
      referenceTime,
      sourceStateHash,
      certificationData.transactionHash,
      certificationData.unlockScript,
    );
    if (predicateVerificationResult.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.NOT_AUTHENTICATED,
        '',
        [predicateVerificationResult],
      );
    }

    return new VerificationResult('InclusionProofVerificationRule', InclusionProofVerificationStatus.OK);
  }
}
