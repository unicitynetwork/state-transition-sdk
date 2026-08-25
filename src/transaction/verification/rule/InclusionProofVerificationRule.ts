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
  MISSING_CERTIFICATION_DATA = 'MISSING_CERTIFICATION_DATA',
  INCOMPLETE_INCLUSION_PROOF = 'INCOMPLETE_INCLUSION_PROOF',
  CERTIFICATION_DATA_MISMATCH = 'CERTIFICATION_DATA_MISMATCH',
  TRANSACTION_HASH_MISMATCH = 'TRANSACTION_HASH_MISMATCH',
  MISSING_REFERENCE_TIME = 'MISSING_REFERENCE_TIME',
  REFERENCE_TIME_AFTER_ROUND = 'REFERENCE_TIME_AFTER_ROUND',
  REQUEST_EXPIRED = 'REQUEST_EXPIRED',
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
   * @param {bigint|null} expiresAt Exclusive request deadline, or `null` when the service assigned one.
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
    const certificationData = inclusionProof.certificationData;
    // The reference time comes from the proof, which is the only party that can
    // state it; the leaf value binds this exact value, so the SMT path below
    // authenticates it.
    const referenceTime = inclusionProof.referenceTime;
    const inclusionCertificate = inclusionProof.inclusionCertificate;

    // A proof reporting no leaf at all is the aggregator's "not certified yet",
    // and the only status {@link waitInclusionProof} polls through.
    if (certificationData == null && referenceTime == null && inclusionCertificate == null) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.INCLUSION_CERTIFICATE_MISSING,
      );
    }

    // Anything in between establishes neither a leaf nor its absence.
    // {@link InclusionProof.fromCBOR} rejects such a proof outright, so this is
    // reachable only from one built by hand — a non-conforming service behind a
    // custom client, or a stripping proxy. Each case reports what is missing:
    // folding them into the pending status would leave the caller polling to
    // its own deadline and blame the timeout.
    if (certificationData == null) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.MISSING_CERTIFICATION_DATA,
      );
    }

    if (referenceTime == null) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.MISSING_REFERENCE_TIME,
      );
    }

    if (inclusionCertificate == null) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.INCOMPLETE_INCLUSION_PROOF,
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
      !certificationData.sourceStateHash.equals(sourceStateHash) ||
      certificationData.expiresAt !== expiresAt
    ) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.CERTIFICATION_DATA_MISMATCH,
      );
    }

    // The request was admissible only in a round strictly before its deadline. A
    // request that carried no deadline was admitted under a service-assigned one,
    // which is not recorded and is not re-checked here.
    if (expiresAt != null && referenceTime >= expiresAt) {
      return new VerificationResult('InclusionProofVerificationRule', InclusionProofVerificationStatus.REQUEST_EXPIRED);
    }

    // A leaf cannot postdate the round that certified it. Consensus signs the
    // round's timestamp, which is that round's own reference time, so this is a
    // free signed upper bound; the tree is append-only, so a proof re-fetched
    // later is certified by a later round and the bound only loosens.
    //
    // It bounds the reference time in one direction only, and the useful
    // direction is the other one. Nothing here establishes when the leaf was
    // actually created: a service that receives a request after its deadline T
    // can insert the leaf now and write referenceTime = T - 1 into it, and both
    // that value and this round's later timestamp satisfy every check in this
    // rule. Enforcing a deadline against a dishonest service needs signed
    // evidence of the creation round, which an inclusion proof does not carry —
    // see the note in README.md. What this rule can establish is that the leaf
    // is internally consistent and that an honest service admitted the request
    // before its deadline.
    if (referenceTime > inclusionProof.unicityCertificate.inputRecord.timestamp) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.REFERENCE_TIME_AFTER_ROUND,
      );
    }

    const stateId = await StateId.fromCertificationData(certificationData);
    const leafValue = await calculateLeafValue(certificationData.transactionHash, referenceTime);
    const result = await inclusionCertificate.verify(
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
