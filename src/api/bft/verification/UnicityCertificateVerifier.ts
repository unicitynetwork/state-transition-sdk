import { UnicitySealHashMatchesWithRootHashRule } from './rule/UnicitySealHashMatchesWithRootHashRule.js';
import { UnicitySealQuorumSignaturesVerificationRule } from './rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { ISignatureVerifier } from '../../../crypto/ISignatureVerifier.js';
import { Signature } from '../../../crypto/secp256k1/Signature.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { InclusionProof } from '../../InclusionProof.js';
import { RootTrustBase } from '../RootTrustBase.js';

/**
 * Result of a {@link UnicityCertificateVerifier} run.
 */
class UnicityCertificateVerificationResult extends VerificationResult<VerificationStatus> {
  private constructor(status: VerificationStatus, results: VerificationResult<unknown>[]) {
    super('UnicityCertificateVerification', status, '', results);
  }

  /**
   * Build a failed verification result.
   *
   * @param {VerificationResult<unknown>[]} results Child rule results.
   * @returns {UnicityCertificateVerificationResult} Failed result.
   */
  public static fail(results: VerificationResult<unknown>[]): UnicityCertificateVerificationResult {
    return new UnicityCertificateVerificationResult(VerificationStatus.FAIL, results);
  }

  /**
   * Build a successful verification result.
   *
   * @param {VerificationResult<unknown>[]} results Child rule results.
   * @returns {UnicityCertificateVerificationResult} Successful result.
   */
  public static ok(results: VerificationResult<unknown>[]): UnicityCertificateVerificationResult {
    return new UnicityCertificateVerificationResult(VerificationStatus.OK, results);
  }
}

/**
 * Unicity certificate verification.
 *
 * Owns the {@link ISignatureVerifier} used for the seal's quorum signatures, so
 * callers pass this domain-level verifier around rather than a bare signature
 * verifier that says nothing about what it verifies.
 */
export class UnicityCertificateVerifier {
  /**
   * @param {ISignatureVerifier<Signature>} signatureVerifier Verifier for root-node signatures.
   */
  public constructor(private readonly signatureVerifier: ISignatureVerifier<Signature>) {}

  /**
   * Verify the unicity certificate in an inclusion proof against the trust base.
   *
   * @param {RootTrustBase} trustBase Root trust base.
   * @param {InclusionProof} inclusionProof Inclusion proof carrying the unicity certificate.
   * @returns {Promise<UnicityCertificateVerificationResult>} Verification outcome.
   */
  public async verify(
    trustBase: RootTrustBase,
    inclusionProof: InclusionProof,
  ): Promise<UnicityCertificateVerificationResult> {
    const results: VerificationResult<VerificationStatus>[] = [];

    if (!inclusionProof.unicityCertificate.unicitySeal.networkId.equals(trustBase.networkId)) {
      results.push(new VerificationResult('UnicitySealNetworkMatchesTrustBaseRule', VerificationStatus.FAIL));
      return UnicityCertificateVerificationResult.fail(results);
    }
    results.push(new VerificationResult('UnicitySealNetworkMatchesTrustBaseRule', VerificationStatus.OK));

    let result = await UnicitySealHashMatchesWithRootHashRule.verify(inclusionProof.unicityCertificate);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return UnicityCertificateVerificationResult.fail(results);
    }

    result = await UnicitySealQuorumSignaturesVerificationRule.verify(
      trustBase,
      this.signatureVerifier,
      inclusionProof.unicityCertificate.unicitySeal,
    );
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return UnicityCertificateVerificationResult.fail(results);
    }

    return UnicityCertificateVerificationResult.ok(results);
  }
}
