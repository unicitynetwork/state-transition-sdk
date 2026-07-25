import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import type { Token } from '../../Token.js';
import { ITokenVerifier } from '../ITokenVerifier.js';
import { IVerificationContext } from '../IVerificationContext.js';
import { CertifiedMintTransactionVerificationRule } from '../rule/CertifiedMintTransactionVerificationRule.js';
import { CertifiedTransferTransactionVerificationRule } from '../rule/CertifiedTransferTransactionVerificationRule.js';

/**
 * Default {@link ITokenVerifier}: verifies the genesis and every transfer of a token
 * sequentially, on any platform. This is the implementation behind {@link Token.verify}
 * and the baseline the worker verifiers must match.
 *
 * Tokens embedded in a mint justification (such as the burned source token of a split)
 * are collected during verification and verified iteratively from a worklist rather than
 * recursively, so an arbitrarily long provenance chain is walked without recursion.
 */
export class TokenVerifier implements ITokenVerifier {
  /**
   * @inheritDoc
   */
  public async verify(token: Token, context: IVerificationContext): Promise<VerificationResult<VerificationStatus>> {
    const pending: Token[] = [token];
    const collectNestedToken = (nested: Token): void => {
      pending.push(nested);
    };

    const results: VerificationResult<unknown>[] = [];
    for (let tokenIndex = 0; tokenIndex < pending.length; tokenIndex++) {
      const current = pending[tokenIndex];
      const rule = `Token[${tokenIndex}:${current.id.toString()}]`;
      const tokenResults: VerificationResult<unknown>[] = [];

      const genesisResult = await CertifiedMintTransactionVerificationRule.verify(
        current.genesis,
        context,
        collectNestedToken,
      );
      tokenResults.push(genesisResult);
      if (genesisResult.status !== VerificationStatus.OK) {
        results.push(
          new VerificationResult(rule, VerificationStatus.FAIL, 'Genesis verification failed', tokenResults),
        );
        return new VerificationResult(
          'TokenVerification',
          VerificationStatus.FAIL,
          `${rule} verification failed`,
          results,
        );
      }

      const transactions = current.transactions;
      const transferResults: VerificationResult<VerificationStatus>[] = [];
      for (let i = 0; i < transactions.length; i++) {
        const transferResult = await CertifiedTransferTransactionVerificationRule.verify(transactions[i], context);
        transferResults.push(transferResult);
        if (transferResult.status !== VerificationStatus.OK) {
          tokenResults.push(
            new VerificationResult('TokenTransferVerification', VerificationStatus.FAIL, '', transferResults),
          );
          results.push(
            new VerificationResult(
              rule,
              VerificationStatus.FAIL,
              `Transaction[${i}] verification failed`,
              tokenResults,
            ),
          );
          return new VerificationResult(
            'TokenVerification',
            VerificationStatus.FAIL,
            `${rule} verification failed`,
            results,
          );
        }
      }

      tokenResults.push(
        new VerificationResult('TokenTransferVerification', VerificationStatus.OK, '', transferResults),
      );
      results.push(new VerificationResult(rule, VerificationStatus.OK, '', tokenResults));
    }

    return new VerificationResult('TokenVerification', VerificationStatus.OK, '', results);
  }
}
