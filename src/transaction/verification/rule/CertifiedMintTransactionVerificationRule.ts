import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { MintSigningService } from '../../../crypto/MintSigningService.js';
import { SignaturePredicate } from '../../../predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../../../predicate/EncodedPredicate.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { CertifiedMintTransaction } from '../../CertifiedMintTransaction.js';
import type { Token } from '../../Token.js';
import { IVerificationContext } from '../IVerificationContext.js';

/**
 * Genesis verification rule.
 */
export class CertifiedMintTransactionVerificationRule {
  /**
   * Verify a certified mint genesis.
   *
   * @param {CertifiedMintTransaction} genesis Certified mint transaction to verify.
   * @param {IVerificationContext} verificationContext Shared verification context (trust base + registries).
   * @param {(token: Token) => void} nestedTokenCollector Receives tokens embedded in the mint justification that the caller must verify.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  public static async verify(
    genesis: CertifiedMintTransaction,
    verificationContext: IVerificationContext,
    nestedTokenCollector: (token: Token) => void,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];

    if (!genesis.networkId.equals(verificationContext.trustBase.networkId)) {
      results.push(new VerificationResult('MintNetworkMatchesTrustBaseRule', VerificationStatus.FAIL));
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        'Mint network does not match trust base.',
        results,
      );
    }
    results.push(new VerificationResult('MintNetworkMatchesTrustBaseRule', VerificationStatus.OK));

    const signingService = await MintSigningService.create(genesis.tokenId);
    const expectedLockScript = EncodedPredicate.fromPredicate(SignaturePredicate.fromSigningService(signingService));
    let result: VerificationResult<unknown> = EncodedPredicate.equals(
      expectedLockScript,
      genesis.inclusionProof.certificationData?.lockScript,
    )
      ? new VerificationResult('IsLockScriptValidVerificationRule', VerificationStatus.OK)
      : new VerificationResult('IsLockScriptValidVerificationRule', VerificationStatus.FAIL);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        'Invalid lock script',
        results,
      );
    }

    result = await InclusionProofVerificationRule.verify(
      verificationContext.trustBase,
      verificationContext.predicateVerifier,
      verificationContext.unicityCertificateVerifier,
      genesis.inclusionProof,
      await genesis.calculateTransactionHash(),
      genesis.expiresAt,
      genesis.referenceTime,
      genesis.lockScript,
      genesis.sourceStateHash,
    );
    results.push(result);
    if (result.status !== InclusionProofVerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        `Inclusion proof verification failed: ${result.status?.toString()}`,
        results,
      );
    }

    result = await verificationContext.tokenIssuanceVerifier.verify(genesis);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        'Invalid token issuance',
        results,
      );
    }

    result = await verificationContext.mintJustificationVerifier.verify(genesis, nestedTokenCollector);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        'Invalid mint justification',
        results,
      );
    }

    return new VerificationResult('CertifiedMintTransactionVerificationRule', VerificationStatus.OK, '', results);
  }
}
