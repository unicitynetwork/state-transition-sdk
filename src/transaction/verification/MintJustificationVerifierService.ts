import { IMintJustificationVerifier } from './IMintJustificationVerifier.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { CertifiedMintTransaction } from '../CertifiedMintTransaction.js';
import type { Token } from '../Token.js';

/**
 * Registry that dispatches mint justification verification to the right
 * {@link IMintJustificationVerifier} based on the justification's CBOR tag.
 */
export class MintJustificationVerifierService {
  private readonly verifiers: Map<bigint, IMintJustificationVerifier> = new Map();

  /**
   * Register a verifier for its declared tag.
   *
   * @param {IMintJustificationVerifier} verifier Verifier to register.
   * @returns {MintJustificationVerifierService} This service for chaining.
   * @throws {Error} If a verifier is already registered for the tag.
   */
  public register(verifier: IMintJustificationVerifier): this {
    if (this.verifiers.has(verifier.tag)) {
      throw new Error(`Duplicate mint justification verifier for tag ${verifier.tag}.`);
    }

    this.verifiers.set(verifier.tag, verifier);
    return this;
  }

  /**
   * Verify the given mint justification with the registered verifier for its tag.
   *
   * @param {CertifiedMintTransaction} transaction Certified mint transaction whose justification to verify.
   * @param {(token: Token) => void} nestedTokenCollector Receives tokens embedded in the justification that the caller must verify.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  public async verify(
    transaction: CertifiedMintTransaction,
    nestedTokenCollector: (token: Token) => void,
  ): Promise<VerificationResult<VerificationStatus>> {
    const bytes = transaction.justification;
    if (!bytes) {
      return new VerificationResult('MintJustificationVerification', VerificationStatus.OK);
    }

    try {
      const tag = CborDeserializer.decodeTag(bytes).tag;
      const verifier = this.verifiers.get(tag);
      if (!verifier) {
        return new VerificationResult(
          'MintJustificationVerification',
          VerificationStatus.FAIL,
          `Unsupported mint justification tag: ${tag}.`,
        );
      }

      const result = await verifier.verify(transaction, nestedTokenCollector);
      if (result.status !== VerificationStatus.OK) {
        return new VerificationResult(
          'MintJustificationVerification',
          VerificationStatus.FAIL,
          `Verification failed for tag ${tag}.`,
          [result],
        );
      }

      return new VerificationResult('MintJustificationVerification', VerificationStatus.OK, '', [result]);
    } catch (error) {
      return new VerificationResult(
        'MintJustificationVerification',
        VerificationStatus.FAIL,
        `Mint justification verification failed with error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
