import { MintJustificationVerifierService } from './MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from './TokenIssuanceVerifierService.js';
import { RootTrustBase } from '../../api/bft/RootTrustBase.js';
import { UnicityCertificateVerifier } from '../../api/bft/verification/UnicityCertificateVerifier.js';
import { PredicateVerifierService } from '../../predicate/verification/PredicateVerifierService.js';

/**
 * Immutable bundle of the dependencies shared across a (possibly recursive) token
 * verification: the single root of trust, the predicate verifier, and the
 * mint-justification and token-issuance registries. It holds no mutable state, so
 * a nested (e.g. burned source) token is always verified under the same root of
 * trust and registries as the outer token.
 */
export interface IVerificationContext {
  readonly mintJustificationVerifier: MintJustificationVerifierService;
  readonly predicateVerifier: PredicateVerifierService;
  readonly tokenIssuanceVerifier: TokenIssuanceVerifierService;
  readonly trustBase: RootTrustBase;
  readonly unicityCertificateVerifier: UnicityCertificateVerifier;
}
