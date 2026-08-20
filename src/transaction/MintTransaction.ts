import { CertifiedMintTransaction } from './CertifiedMintTransaction.js';
import { ITransaction } from './ITransaction.js';
import { MintTransactionState } from './MintTransactionState.js';
import { StateMask } from './StateMask.js';
import { TokenId } from './TokenId.js';
import { TokenSalt } from './TokenSalt.js';
import { TokenType } from './TokenType.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { UnicityCertificateVerifier } from '../api/bft/verification/UnicityCertificateVerifier.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { NetworkId } from '../api/NetworkId.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { MintSigningService } from '../crypto/MintSigningService.js';
import { SignaturePredicate } from '../predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Token mint transaction.
 */
export class MintTransaction implements ITransaction {
  public static readonly CBOR_TAG = 39041n;
  private static readonly LEGACY_VERSION = 1n;
  private static readonly TIMEOUT_VERSION = 2n;

  private readonly _brand = 'MintTransaction' as const;

  private constructor(
    public readonly sourceStateHash: MintTransactionState,
    public readonly lockScript: EncodedPredicate,
    public readonly networkId: NetworkId,
    public readonly recipient: EncodedPredicate,
    public readonly salt: TokenSalt,
    public readonly tokenType: TokenType,
    public readonly tokenId: TokenId,
    public readonly timeout: bigint | null,
    private readonly _justification: Uint8Array | null,
    private readonly _data: Uint8Array | null,
  ) {}

  /**
   * @returns {Uint8Array|null} Copy of the data payload, or `null` if absent.
   */
  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

  /**
   * @returns {Uint8Array|null} Copy of the mint justification bytes, or `null` if absent.
   */
  public get justification(): Uint8Array | null {
    return this._justification ? new Uint8Array(this._justification) : null;
  }

  /**
   * @returns {StateMask} State mask used when computing the resulting state hash (the token identifier).
   */
  public get stateMask(): StateMask {
    return StateMask.fromBytes(this.tokenId.bytes);
  }

  /**
   * @returns {bigint} Wire-format version of this transaction.
   */
  public get version(): bigint {
    return this.timeout == null ? MintTransaction.LEGACY_VERSION : MintTransaction.TIMEOUT_VERSION;
  }

  /**
   * Create a MintTransaction for a fresh token.
   *
   * @param {NetworkId} networkId Network identifier.
   * @param {IPredicate} recipient Predicate that will lock the minted state.
   * @param {Uint8Array|null} data Optional data payload.
   * @param {TokenType} tokenType Token type being minted.
   * @param {TokenSalt} salt Mint-transaction salt; defaults to a random 32-byte salt.
   * @param {Uint8Array|null} justification Optional mint justification bytes.
   * @returns {Promise<MintTransaction>} New mint transaction.
   */
  public static create(
    networkId: NetworkId,
    recipient: IPredicate,
    data?: Uint8Array | null,
    tokenType?: TokenType,
    salt?: TokenSalt,
    justification?: Uint8Array | null,
  ): Promise<MintTransaction>;
  public static create(
    networkId: NetworkId,
    recipient: IPredicate,
    timeout: bigint,
    data?: Uint8Array | null,
    tokenType?: TokenType,
    salt?: TokenSalt,
    justification?: Uint8Array | null,
  ): Promise<MintTransaction>;
  public static async create(
    networkId: NetworkId,
    recipient: IPredicate,
    dataOrTimeout: Uint8Array | bigint | null = null,
    tokenTypeOrData?: TokenType | Uint8Array | null,
    saltOrTokenType?: TokenSalt | TokenType,
    justificationOrSalt?: Uint8Array | TokenSalt | null,
    explicitJustification: Uint8Array | null = null,
  ): Promise<MintTransaction> {
    const explicitTimeout = typeof dataOrTimeout === 'bigint' ? dataOrTimeout : null;
    let data = explicitTimeout == null ? (dataOrTimeout as Uint8Array | null) : (tokenTypeOrData as Uint8Array | null);
    const tokenType =
      ((explicitTimeout == null ? tokenTypeOrData : saltOrTokenType) as TokenType | undefined) ?? TokenType.generate();
    const salt =
      ((explicitTimeout == null ? saltOrTokenType : justificationOrSalt) as TokenSalt | undefined) ??
      TokenSalt.generate();
    let justification =
      explicitTimeout == null ? (justificationOrSalt as Uint8Array | null | undefined) : explicitJustification;
    justification ??= null;
    justification = justification ? new Uint8Array(justification) : null;
    data = data ? new Uint8Array(data) : null;

    const tokenId = await TokenId.fromSalt(networkId, salt);
    const signingService = await MintSigningService.create(tokenId);
    return new MintTransaction(
      await MintTransactionState.create(tokenId),
      EncodedPredicate.fromPredicate(SignaturePredicate.fromSigningService(signingService)),
      networkId,
      EncodedPredicate.fromPredicate(recipient),
      salt,
      tokenType,
      tokenId,
      explicitTimeout,
      justification,
      data,
    );
  }

  /** Create a mint transaction with an explicit exclusive request timeout. */
  public static createWithTimeout(
    networkId: NetworkId,
    recipient: IPredicate,
    timeout: bigint,
    data: Uint8Array | null = null,
    tokenType: TokenType = TokenType.generate(),
    salt: TokenSalt = TokenSalt.generate(),
    justification: Uint8Array | null = null,
  ): Promise<MintTransaction> {
    return MintTransaction.create(networkId, recipient, timeout, data, tokenType, salt, justification);
  }

  /**
   * Create MintTransaction from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {Promise<MintTransaction>} Decoded transaction.
   * @throws {CborError} On wrong tag or unsupported version.
   */
  public static async fromCBOR(bytes: Uint8Array): Promise<MintTransaction> {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== MintTransaction.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for MintTransaction: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version === MintTransaction.LEGACY_VERSION && data.length === 7) {
      return MintTransaction.create(
        NetworkId.fromId(CborDeserializer.decodeUnsignedInteger(data[1])),
        EncodedPredicate.fromCBOR(data[2]),
        CborDeserializer.decodeNullable(data[6], CborDeserializer.decodeByteString),
        TokenType.fromCBOR(data[4]),
        TokenSalt.fromCBOR(data[3]),
        CborDeserializer.decodeNullable(data[5], CborDeserializer.decodeByteString),
      );
    }
    if (version !== MintTransaction.TIMEOUT_VERSION || data.length !== 8) {
      throw new CborError(`Unsupported MintTransaction version: ${version}`);
    }

    return await MintTransaction.createWithTimeout(
      NetworkId.fromId(CborDeserializer.decodeUnsignedInteger(data[1])),
      EncodedPredicate.fromCBOR(data[2]),
      CborDeserializer.decodeUnsignedInteger(data[7]),
      CborDeserializer.decodeNullable(data[6], CborDeserializer.decodeByteString),
      TokenType.fromCBOR(data[4]),
      TokenSalt.fromCBOR(data[3]),
      CborDeserializer.decodeNullable(data[5], CborDeserializer.decodeByteString),
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
          this.stateMask.toCBOR(),
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
      MintTransaction.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        CborSerializer.encodeUnsignedInteger(this.networkId.id),
        this.recipient.toCBOR(),
        this.salt.toCBOR(),
        this.tokenType.toCBOR(),
        CborSerializer.encodeNullable(this._justification, CborSerializer.encodeByteString),
        CborSerializer.encodeNullable(this._data, CborSerializer.encodeByteString),
        ...(this.timeout == null ? [] : [CborSerializer.encodeUnsignedInteger(this.timeout)]),
      ),
    );
  }

  /**
   * Bundle this transaction with its inclusion proof into a CertifiedMintTransaction.
   *
   * @param {RootTrustBase} trustBase Root trust base used to verify the inclusion certificate.
   * @param {PredicateVerifierService} predicateVerifier Verifier for any predicates.
   * @param {UnicityCertificateVerifier} unicityCertificateVerifier Unicity certificate verifier.
   * @param {InclusionProof} inclusionProof Inclusion proof for this transaction.
   * @returns {Promise<CertifiedMintTransaction>} Verified certified transaction.
   */
  public toCertifiedTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    unicityCertificateVerifier: UnicityCertificateVerifier,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedMintTransaction> {
    return CertifiedMintTransaction.fromTransaction(
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
      MintTransaction
        Version: ${this.version.toString()}
        Network ID: ${this.networkId.toString()}
        Lock Script:
          ${this.lockScript.toString()}
        Recipient: ${this.recipient.toString()}
        Salt: ${this.salt.toString()}
        Token ID: ${this.tokenId.toString()}
        Token Type: ${this.tokenType.toString()}
        Mint Justification: ${this._justification ? HexConverter.encode(this._justification) : 'null'}
        Data: ${this._data ? HexConverter.encode(this._data) : 'null'}
        Timeout: ${this.timeout?.toString() ?? 'service default'}`;
  }
}
