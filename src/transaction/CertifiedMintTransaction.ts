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
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { dedent } from '../util/StringUtils.js';
import { VerificationError } from '../verification/VerificationError.js';
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
    public readonly inclusionProof: InclusionProof,
  ) {}

  /**
   * @returns {Uint8Array|null} Data payload of the inner transaction.
   */
  public get data(): Uint8Array | null {
    return this.transaction.data;
  }

  /**
   * @returns {bigint|null} Exclusive request deadline of the inner transaction, in Unix seconds.
   */
  public get expiresAt(): bigint | null {
    return this.transaction.expiresAt;
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
   * @returns {bigint} Reference time of the round the leaf was created in, in Unix seconds.
   *
   * Read from the inclusion proof rather than stored beside it: the service
   * records the leaf's creation time on the record itself and serves that same
   * value for every proof of the leaf, and the leaf value binds it, so the
   * proof is the authenticated source for it.
   */
  public get referenceTime(): bigint {
    // Non-null by construction: every factory below rejects a proof without one.
    return this.inclusionProof.referenceTime as bigint;
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
    const data = CborDeserializer.decodeArray(bytes, 2);
    const proof = InclusionProof.fromCBOR(data[1]);
    // A certified transaction is one bound to a leaf. A proof that reports no
    // leaf cannot certify anything, and decoding it into one would hand every
    // later verifier a transaction with no reference time.
    if (proof.referenceTime == null) {
      throw new CborError('Certified mint transaction carries an inclusion proof with no certified leaf.');
    }
    return new CertifiedMintTransaction(await MintTransaction.fromCBOR(data[0]), proof);
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
    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      unicityCertificateVerifier,
      inclusionProof,
      await transaction.calculateTransactionHash(),
      transaction.expiresAt,
      transaction.lockScript,
      transaction.sourceStateHash,
    );
    if (result.status !== InclusionProofVerificationStatus.OK) {
      throw new VerificationError('Inclusion proof verification failed', result);
    }

    return new CertifiedMintTransaction(transaction, inclusionProof);
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
    return CborSerializer.encodeArray(this.transaction.toCBOR(), this.inclusionProof.toCBOR());
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
