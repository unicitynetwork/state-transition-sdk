import { DataHash } from '../crypto/hash/DataHash.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { MintSigningService } from '../crypto/MintSigningService.js';
import { SignaturePredicateUnlockScript } from '../predicate/builtin/SignaturePredicateUnlockScript.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IUnlockScript } from '../predicate/IUnlockScript.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { ITransaction } from '../transaction/ITransaction.js';
import { MintTransaction } from '../transaction/MintTransaction.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Certification request data.
 */
export class CertificationData {
  public static readonly CBOR_TAG = 39031n;
  /** The only accepted wire version. One version, one element count. */
  public static readonly VERSION = 2n;
  private static readonly FIELD_COUNT = 6;

  /**
   * Create a certification data object.
   * @param {IPredicate} lockScript
   * @param {DataHash} sourceStateHash
   * @param {DataHash} transactionHash
   * @param {bigint|null} expiresAt Exclusive request deadline in Unix seconds, or `null` when the service assigns one
   * @param {Uint8Array} _unlockScript Unlock script bytes
   */
  private constructor(
    public readonly lockScript: EncodedPredicate,
    public readonly sourceStateHash: DataHash,
    public readonly transactionHash: DataHash,
    public readonly expiresAt: bigint | null,
    private readonly _unlockScript: Uint8Array,
  ) {
    this._unlockScript = new Uint8Array(_unlockScript);
  }

  /**
   * Get the unlock script.
   */
  public get unlockScript(): Uint8Array {
    return new Uint8Array(this._unlockScript);
  }

  /**
   * @returns {bigint} Wire-format version of this certification data.
   */
  public get version(): bigint {
    return CertificationData.VERSION;
  }

  /**
   * Create CertificationData from CBOR bytes.
   * @param {Uint8Array} bytes CBOR bytes
   *
   * @returns {CertificationData} certification data
   */
  public static fromCBOR(bytes: Uint8Array): CertificationData {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== CertificationData.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for CertificationData: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data, CertificationData.FIELD_COUNT);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== CertificationData.VERSION) {
      throw new CborError(`Unsupported CertificationData version: ${version}`);
    }

    return new CertificationData(
      EncodedPredicate.fromCBOR(data[1]),
      new DataHash(HashAlgorithm.SHA256, CborDeserializer.decodeByteString(data[2])),
      new DataHash(HashAlgorithm.SHA256, CborDeserializer.decodeByteString(data[3])),
      CborDeserializer.decodeNullable(data[4], CborDeserializer.decodeUnsignedInteger),
      CborDeserializer.decodeByteString(data[5]),
    );
  }

  /**
   * Create CertificationData from a mint transaction.
   *
   * @param {MintTransaction} transaction Mint transaction to certify.
   * @returns {Promise<CertificationData>} Certification data.
   */
  public static async fromMintTransaction(transaction: MintTransaction): Promise<CertificationData> {
    const signingService = await MintSigningService.create(transaction.tokenId);

    return CertificationData.fromTransaction(
      transaction,
      await SignaturePredicateUnlockScript.create(transaction, signingService),
    );
  }

  /**
   * Create CertificationData from a transaction and its unlock script.
   *
   * @param {ITransaction} transaction Transaction to certify.
   * @param {IUnlockScript} unlockScript Unlock script for the transaction.
   * @returns {Promise<CertificationData>} Certification data.
   */
  public static async fromTransaction(
    transaction: ITransaction,
    unlockScript: IUnlockScript,
  ): Promise<CertificationData> {
    const transactionHash = await transaction.calculateTransactionHash();

    return new CertificationData(
      transaction.lockScript,
      transaction.sourceStateHash,
      transactionHash,
      transaction.expiresAt,
      unlockScript.encode(),
    );
  }

  /**
   * Convert the certification data to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      CertificationData.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(CertificationData.VERSION),
        this.lockScript.toCBOR(),
        CborSerializer.encodeByteString(this.sourceStateHash.data),
        CborSerializer.encodeByteString(this.transactionHash.data),
        CborSerializer.encodeNullable(this.expiresAt, CborSerializer.encodeUnsignedInteger),
        CborSerializer.encodeByteString(this._unlockScript),
      ),
    );
  }

  /**
   * Returns a string representation of the CertificationData.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Certification Data
        Version: ${CertificationData.VERSION}
        Owner Predicate: 
          ${this.lockScript.toString()}
        Source State Hash: ${this.sourceStateHash.toString()}
        Transaction Hash: ${this.transactionHash.toString()}
        Expires At: ${this.expiresAt?.toString() ?? 'service assigned'}
        Witness: ${HexConverter.encode(this._unlockScript)}`;
  }
}
