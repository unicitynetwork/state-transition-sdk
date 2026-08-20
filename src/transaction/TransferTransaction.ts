import { CertifiedTransferTransaction } from './CertifiedTransferTransaction.js';
import { ITransaction } from './ITransaction.js';
import { StateMask } from './StateMask.js';
import { Token } from './Token.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { UnicityCertificateVerifier } from '../api/bft/verification/UnicityCertificateVerifier.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Token transfer transaction.
 */
export class TransferTransaction implements ITransaction {
  public static readonly CBOR_TAG = 39045n;
  private static readonly VERSION = 1n;

  private constructor(
    public readonly sourceStateHash: DataHash,
    public readonly lockScript: EncodedPredicate,
    public readonly recipient: EncodedPredicate,
    public readonly timeout: bigint,
    private readonly _stateMask: StateMask,
    private readonly _data: Uint8Array | null,
  ) {}

  /**
   * @returns {Uint8Array|null} Copy of the data payload, or `null` if absent.
   */
  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

  /**
   * @returns {StateMask} The state mask.
   */
  public get stateMask(): StateMask {
    return this._stateMask;
  }

  /**
   * @returns {bigint} Wire-format version of this transaction.
   */
  public get version(): bigint {
    return TransferTransaction.VERSION;
  }

  /**
   * Create a TransferTransaction for the given token.
   *
   * @param {Token} token Token being transferred (last transaction is used as the source).
   * @param {IPredicate} recipient Predicate that will lock the new state.
   * @param {StateMask} stateMask State mask mixed into the new state hash.
   * @param {bigint} timeout Exclusive timeout of the certification request.
   * @param {Uint8Array|null} data Optional data payload.
   * @returns {Promise<TransferTransaction>} New transfer transaction.
   */
  public static async create(
    token: Token,
    recipient: IPredicate,
    stateMask: StateMask,
    timeout: bigint,
    data: Uint8Array | null = null,
  ): Promise<TransferTransaction> {
    data = data ? new Uint8Array(data) : null;

    const transaction = token.latestTransaction;
    return new TransferTransaction(
      await transaction.calculateStateHash(),
      transaction.recipient,
      EncodedPredicate.fromPredicate(recipient),
      timeout,
      stateMask,
      data,
    );
  }

  /**
   * Create TransferTransaction from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @param {Token} token Token providing context for the transfer transaction.
   * @returns {Promise<TransferTransaction>} Decoded transaction.
   * @throws {CborError} On wrong tag or unsupported version.
   */
  public static fromCBOR(bytes: Uint8Array, token: Token): Promise<TransferTransaction> {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== TransferTransaction.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for TransferTransaction: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data, 5);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== TransferTransaction.VERSION) {
      throw new CborError(`Unsupported TransferTransaction version: ${version}`);
    }

    return TransferTransaction.create(
      token,
      EncodedPredicate.fromCBOR(data[1]),
      StateMask.fromCBOR(data[2]),
      CborDeserializer.decodeUnsignedInteger(data[4]),
      CborDeserializer.decodeNullable(data[3], CborDeserializer.decodeByteString),
    );
  }

  /**
   * @inheritDoc
   */
  public calculateStateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(this.sourceStateHash.imprint),
          this._stateMask.toCBOR(),
        ),
      )
      .digest();
  }

  /**
   * @inheritDoc
   */
  public calculateTransactionHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(this.toCBOR()).digest();
  }

  /**
   * @inheritDoc
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      TransferTransaction.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        this.recipient.toCBOR(),
        this._stateMask.toCBOR(),
        CborSerializer.encodeNullable(this._data, CborSerializer.encodeByteString),
        CborSerializer.encodeUnsignedInteger(this.timeout),
      ),
    );
  }

  /**
   * Bundle this transaction with its inclusion proof into a CertifiedTransferTransaction.
   *
   * @param {RootTrustBase} trustBase Root trust base used to verify the inclusion certificate.
   * @param {PredicateVerifierService} predicateVerifier Verifier for any embedded predicates.
   * @param {UnicityCertificateVerifier} unicityCertificateVerifier Unicity certificate verifier.
   * @param {InclusionProof} inclusionProof Inclusion proof for this transaction.
   * @returns {Promise<CertifiedTransferTransaction>} Verified certified transaction.
   */
  public toCertifiedTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    unicityCertificateVerifier: UnicityCertificateVerifier,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedTransferTransaction> {
    return CertifiedTransferTransaction.fromTransaction(
      trustBase,
      predicateVerifier,
      unicityCertificateVerifier,
      this,
      inclusionProof,
    );
  }

  /**
   * @returns {string} String representation of the transaction.
   */
  public toString(): string {
    return dedent`
      TransferTransaction
        Version: ${this.version.toString()}
        Source State Hash: ${this.sourceStateHash.toString()}
        Lock Script: 
          ${this.lockScript.toString()}
        Recipient: ${this.recipient.toString()}
        StateMask: ${this._stateMask.toString()}
        Data: ${this._data ? HexConverter.encode(this._data) : 'null'}
        Timeout: ${this.timeout.toString()}`;
  }
}
