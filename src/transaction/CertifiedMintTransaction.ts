import { ITransaction } from './ITransaction.js';
import { MintTransaction } from './MintTransaction.js';
import { StateMask } from './StateMask.js';
import { TokenId } from './TokenId.js';
import { TokenSalt } from './TokenSalt.js';
import { TokenType } from './TokenType.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { UnicityCertificateVerifier } from '../api/bft/verification/UnicityCertificateVerifier.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { NetworkId } from '../api/NetworkId.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { dedent } from '../util/StringUtils.js';
import { VerificationError } from '../verification/VerificationError.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from './verification/rule/InclusionProofVerificationRule.js';

/**
 * Mint transaction bundled with a verified inclusion proof.
 */
export class CertifiedMintTransaction implements ITransaction {
  private readonly _brand = 'CertifiedMintTransaction' as const;

  private constructor(
    private readonly transaction: MintTransaction,
    public readonly referenceTime: bigint,
    public readonly inclusionProof: InclusionProof,
  ) {}

  /**
   * @returns {Uint8Array|null} Data payload of the inner transaction.
   */
  public get data(): Uint8Array | null {
    return this.transaction.data;
  }

  /**
   * @returns {Uint8Array|null} Mint justification bytes of the inner transaction.
   */
  public get justification(): Uint8Array | null {
    return this.transaction.justification;
  }

  /**
   * @returns {EncodedPredicate} Lock script of the inner transaction.
   */
  public get lockScript(): EncodedPredicate {
    return this.transaction.lockScript;
  }

  /**
   * @returns {NetworkId} Network identifier of the inner transaction.
   */
  public get networkId(): NetworkId {
    return this.transaction.networkId;
  }

  /**
   * @returns {EncodedPredicate} Recipient predicate of the inner transaction.
   */
  public get recipient(): EncodedPredicate {
    return this.transaction.recipient;
  }

  /**
   * @returns {TokenSalt} Mint-transaction salt of the inner transaction.
   */
  public get salt(): TokenSalt {
    return this.transaction.salt;
  }

  /**
   * @returns {DataHash} Source state hash of the inner transaction.
   */
  public get sourceStateHash(): DataHash {
    return this.transaction.sourceStateHash;
  }

  /**
   * @returns {StateMask} State mask of the inner transaction.
   */
  public get stateMask(): StateMask {
    return this.transaction.stateMask;
  }

  /**
   * @returns {bigint} Exclusive certification request timeout of the inner transaction.
   */
  public get timeout(): bigint | null {
    return this.transaction.timeout;
  }

  /**
   * @returns {TokenId} Token id of the inner transaction (derived from networkId and salt).
   */
  public get tokenId(): TokenId {
    return this.transaction.tokenId;
  }

  /**
   * @returns {TokenType} Token type of the inner transaction.
   */
  public get tokenType(): TokenType {
    return this.transaction.tokenType;
  }

  /**
   * Create CertifiedMintTransaction from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {Promise<CertifiedMintTransaction>} Decoded certified transaction.
   */
  public static async fromCBOR(bytes: Uint8Array): Promise<CertifiedMintTransaction> {
    const data = CborDeserializer.decodeArray(bytes, 3);
    const referenceTime = CborDeserializer.decodeUnsignedInteger(data[1]);
    const proof = InclusionProof.fromCBOR(data[2]);
    if (proof.referenceTime == null || referenceTime !== proof.referenceTime) {
      throw new Error('Certified mint transaction reference time does not match its inclusion proof.');
    }
    return new CertifiedMintTransaction(await MintTransaction.fromCBOR(data[0]), referenceTime, proof);
  }

  /**
   * Create CertifiedMintTransaction from mint transaction and inclusion proof.
   *
   * @param {RootTrustBase} trustBase Root trust base used to verify the inclusion certificate.
   * @param {PredicateVerifierService} predicateVerifier Verifier for any embedded predicates.
   * @param {UnicityCertificateVerifier} unicityCertificateVerifier Unicity certificate verifier.
   * @param {MintTransaction} transaction Transaction to certify.
   * @param {InclusionProof} inclusionProof Inclusion proof for the transaction.
   * @returns {Promise<CertifiedMintTransaction>} Verified certified transaction.
   * @throws {VerificationError} If the inclusion proof does not verify.
   */
  public static async fromTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    unicityCertificateVerifier: UnicityCertificateVerifier,
    transaction: MintTransaction,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedMintTransaction> {
    // The reference time is fixed here, at the moment the transaction is bound
    // to its first proof. Later verifiers use the carried value: a proof
    // fetched later may be issued against a later root and would then carry a
    // different input record time.
    const referenceTime = inclusionProof.referenceTime;
    if (referenceTime == null) {
      throw new VerificationError(
        'Inclusion proof verification failed',
        new VerificationResult(
          'InclusionProofVerificationRule',
          InclusionProofVerificationStatus.MISSING_REFERENCE_TIME,
        ),
      );
    }

    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      unicityCertificateVerifier,
      inclusionProof,
      await transaction.calculateTransactionHash(),
      transaction.timeout,
      referenceTime,
      transaction.lockScript,
      transaction.sourceStateHash,
    );
    if (result.status !== InclusionProofVerificationStatus.OK) {
      throw new VerificationError('Inclusion proof verification failed', result);
    }

    return new CertifiedMintTransaction(transaction, referenceTime, inclusionProof);
  }

  /**
   * @inheritDoc
   */
  public calculateStateHash(): Promise<DataHash> {
    return this.transaction.calculateStateHash();
  }

  /**
   * @inheritDoc
   */
  public calculateTransactionHash(): Promise<DataHash> {
    return this.transaction.calculateTransactionHash();
  }

  /**
   * @inheritDoc
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.transaction.toCBOR(),
      CborSerializer.encodeUnsignedInteger(this.referenceTime),
      this.inclusionProof.toCBOR(),
    );
  }

  /**
   * @returns {string} String representation of the certified transaction.
   */
  public toString(): string {
    return dedent`
      CertifiedMintTransaction
        ${this.transaction.toString()}
        Reference Time: ${this.referenceTime.toString()}
        ${this.inclusionProof.toString()}`;
  }
}
