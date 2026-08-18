import { IVerificationContext } from './IVerificationContext.js';
import { MintJustificationVerifierService } from './MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from './TokenIssuanceVerifierService.js';
import { RootTrustBase } from '../../api/bft/RootTrustBase.js';
import { UnicityCertificateVerifier } from '../../api/bft/verification/UnicityCertificateVerifier.js';
import { PredicateVerifierService } from '../../predicate/verification/PredicateVerifierService.js';

/**
 * Default {@link IVerificationContext} implementation. All verifiers must be supplied
 * explicitly: a defaulted token-issuance verifier would be an empty fail-closed registry
 * that rejects every token, so there is no sensible default. Build and populate the
 * verifiers before constructing the context and pass them in — the context itself is immutable.
 */
export class VerificationContext implements IVerificationContext {
  /**
   * @param {RootTrustBase} trustBase Root trust base for the network.
   * @param {PredicateVerifierService} predicateVerifier Predicate verifier.
   * @param {UnicityCertificateVerifier} unicityCertificateVerifier Unicity certificate verifier.
   * @param {MintJustificationVerifierService} mintJustificationVerifier Mint justification registry.
   * @param {TokenIssuanceVerifierService} tokenIssuanceVerifier Token issuance registry.
   */
  public constructor(
    public readonly trustBase: RootTrustBase,
    public readonly predicateVerifier: PredicateVerifierService,
    public readonly unicityCertificateVerifier: UnicityCertificateVerifier,
    public readonly mintJustificationVerifier: MintJustificationVerifierService,
    public readonly tokenIssuanceVerifier: TokenIssuanceVerifierService,
  ) {}
}
