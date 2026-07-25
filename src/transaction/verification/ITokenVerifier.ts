import { IVerificationContext } from './IVerificationContext.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import type { Token } from '../Token.js';

/**
 * Verifies a {@link Token} (its genesis and every transfer, plus any nested
 * tokens embedded in a mint justification) under a shared
 * {@link IVerificationContext}.
 *
 * The default {@link TokenVerifier} walks the provenance sequentially and runs
 * on any platform. Platform-specific implementations (e.g. Web Workers in the
 * browser, worker threads in Node) may parallelise the independent per-transfer
 * work while producing the same aggregated result.
 */
export interface ITokenVerifier {
  /**
   * Verify a token under the given context.
   *
   * @param {Token} token Token to verify.
   * @param {IVerificationContext} context Shared verification context (trust base + registries).
   * @returns {Promise<VerificationResult<VerificationStatus>>} Aggregated verification result.
   */
  verify(token: Token, context: IVerificationContext): Promise<VerificationResult<VerificationStatus>>;
}
