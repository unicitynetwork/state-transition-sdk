import { ShardIdMatchesStateIdRule } from './ShardIdMatchesStateIdRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { UnicityCertificateVerification } from '../../../api/bft/verification/UnicityCertificateVerification.js';
import { InclusionProof } from '../../../api/InclusionProof.js';
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
  MISSING_CERTIFICATION_DATA = 'MISSING_CERTIFICATION_DATA',
  CERTIFICATION_DATA_MISMATCH = 'CERTIFICATION_DATA_MISMATCH',
  TRANSACTION_HASH_MISMATCH = 'TRANSACTION_HASH_MISMATCH',
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  INCLUSION_CERTIFICATE_MISSING = 'INCLUSION_CERTIFICATE_MISSING',
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
   * @param {EncodedPredicate} lockScript Lock script the transaction unlocks.
   * @param {DataHash} sourceStateHash Hash of the state the transaction spends.
   * @returns {Promise<VerificationResult<InclusionProofVerificationStatus>>} Verification outcome.
   */
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifierFactory: PredicateVerifierService,
    inclusionProof: InclusionProof,
    transactionHash: DataHash,
    lockScript: EncodedPredicate,
    sourceStateHash: DataHash,
  ): Promise<VerificationResult<InclusionProofVerificationStatus>> {
    if (!inclusionProof.inclusionCertificate) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.INCLUSION_CERTIFICATE_MISSING,
      );
    }

    const certificationData = inclusionProof.certificationData;
    if (!certificationData) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.MISSING_CERTIFICATION_DATA,
      );
    }

    if (!certificationData.transactionHash.equals(transactionHash)) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.TRANSACTION_HASH_MISMATCH,
      );
    }

    if (
      !EncodedPredicate.equals(certificationData.lockScript, lockScript) ||
      !certificationData.sourceStateHash.equals(sourceStateHash)
    ) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.CERTIFICATION_DATA_MISMATCH,
      );
    }

    const stateId = await StateId.fromCertificationData(certificationData);
    const result = await inclusionProof.inclusionCertificate.verify(
      stateId,
      certificationData.transactionHash,
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

    const unicityCertificateVerificationResult = await UnicityCertificateVerification.verify(trustBase, inclusionProof);

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
