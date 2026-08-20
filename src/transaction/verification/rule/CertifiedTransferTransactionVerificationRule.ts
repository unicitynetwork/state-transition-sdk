import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { CertifiedTransferTransaction } from '../../CertifiedTransferTransaction.js';
import { IVerificationContext } from '../IVerificationContext.js';

/**
 * Transfer transaction verification rule.
 */
export class CertifiedTransferTransactionVerificationRule {
  /**
   * Verify a certified transfer transaction.
   *
   * @param {CertifiedTransferTransaction} transaction Transfer transaction to verify.
   * @param {IVerificationContext} verificationContext Shared verification context (trust base + registries).
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  public static async verify(
    transaction: CertifiedTransferTransaction,
    verificationContext: IVerificationContext,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];
    const result: VerificationResult<unknown> = await InclusionProofVerificationRule.verify(
      verificationContext.trustBase,
      verificationContext.predicateVerifier,
      verificationContext.unicityCertificateVerifier,
      transaction.inclusionProof,
      await transaction.calculateTransactionHash(),
      transaction.timeout,
      transaction.referenceTime,
      transaction.lockScript,
      transaction.sourceStateHash,
    );
    results.push(result);

    if (result.status !== InclusionProofVerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedTransferTransactionVerificationRule',
        VerificationStatus.FAIL,
        `Inclusion proof verification failed: ${result.status?.toString()}`,
        results,
      );
    }

    return new VerificationResult('CertifiedTransferTransactionVerificationRule', VerificationStatus.OK, '', results);
  }
}
