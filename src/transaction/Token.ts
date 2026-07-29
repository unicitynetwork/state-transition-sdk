import { CertifiedMintTransaction } from './CertifiedMintTransaction.js';
import { CertifiedTransferTransaction } from './CertifiedTransferTransaction.js';
import { ITransaction } from './ITransaction.js';
import { TokenId } from './TokenId.js';
import { TokenType } from './TokenType.js';
import { IVerificationContext } from './verification/IVerificationContext.js';
import { NetworkId } from '../api/NetworkId.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { dedent } from '../util/StringUtils.js';
import { VerificationError } from '../verification/VerificationError.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';
import { TokenVerifier } from './verification/default/TokenVerifier.js';
import { CertifiedTransferTransactionVerificationRule } from './verification/rule/CertifiedTransferTransactionVerificationRule.js';

/**
 * Token representation.
 */
export class Token {
  public static readonly CBOR_TAG = 39040n;
  private static readonly VERSION = 1n;

  private constructor(
    public readonly genesis: CertifiedMintTransaction,
    private readonly _transactions: CertifiedTransferTransaction[] = [],
  ) {}

  /**
   * @returns {TokenId} Token id from the genesis transaction.
   */
  public get id(): TokenId {
    return this.genesis.tokenId;
  }

  /**
   * @returns {ITransaction} Latest transaction, or the genesis if there are no transfers.
   */
  public get latestTransaction(): ITransaction {
    return this._transactions.at(-1) ?? this.genesis;
  }

  /**
   * @returns {NetworkId} Network identifier from the genesis transaction.
   */
  public get networkId(): NetworkId {
    return this.genesis.networkId;
  }

  /**
   * @returns {CertifiedTransferTransaction[]} Copy of the transfer history.
   */
  public get transactions(): CertifiedTransferTransaction[] {
    return this._transactions.slice();
  }

  /**
   * @returns {TokenType} Token type from the genesis transaction.
   */
  public get type(): TokenType {
    return this.genesis.tokenType;
  }

  /**
   * @returns {bigint} Wire-format version of this token.
   */
  public get version(): bigint {
    return Token.VERSION;
  }

  /**
   * Create Token from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {Promise<Token>} Decoded token.
   * @throws {CborError} On wrong tag or unsupported version.
   */
  public static async fromCBOR(bytes: Uint8Array): Promise<Token> {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== Token.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for Token: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data, 3);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== Token.VERSION) {
      throw new CborError(`Unsupported Token version: ${version}`);
    }

    const transactionsBytes = CborDeserializer.decodeArray(data[2]);
    const genesis = await CertifiedMintTransaction.fromCBOR(data[1]);
    const transactions: CertifiedTransferTransaction[] = [];
    const token = new Token(genesis, transactions);
    for (const transaction of transactionsBytes) {
      transactions.push(await CertifiedTransferTransaction.fromCBOR(transaction, token));
    }

    return token;
  }

  /**
   * Create a Token from a verified genesis mint transaction.
   *
   * @param {CertifiedMintTransaction} genesis Genesis mint transaction.
   * @param {IVerificationContext} verificationContext Shared verification context (trust base + registries).
   * @returns {Promise<Token>} New token.
   * @throws {VerificationError} If the genesis does not verify.
   */
  public static async mint(
    genesis: CertifiedMintTransaction,
    verificationContext: IVerificationContext,
  ): Promise<Token> {
    const token = new Token(genesis);
    const result = await token.verify(verificationContext);
    if (result.status !== VerificationStatus.OK) {
      throw new VerificationError('Invalid token genesis', result);
    }

    return token;
  }

  /**
   * Convert Token to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      Token.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        this.genesis.toCBOR(),
        CborSerializer.encodeArray(...this._transactions.map((transaction) => transaction.toCBOR())),
      ),
    );
  }

  /**
   * @returns {string} String representation of the token.
   */
  public toString(): string {
    return dedent`
      Token
        Version: ${this.version.toString()}
        ${this.genesis.toString()}
        Transactions: [
          ${this._transactions.map((transaction) => transaction.toString()).join('\n')}
        ]`;
  }

  /**
   * Append token with certified transfer transaction.
   *
   * @param {CertifiedTransferTransaction} transaction Transfer transaction to apply.
   * @param {IVerificationContext} verificationContext Shared verification context (trust base + registries).
   * @returns {Promise<Token>} Updated token including the new transaction.
   * @throws {VerificationError} If the transfer transaction does not verify.
   */
  public async transfer(
    transaction: CertifiedTransferTransaction,
    verificationContext: IVerificationContext,
  ): Promise<Token> {
    const result = await CertifiedTransferTransactionVerificationRule.verify(transaction, verificationContext);
    if (result.status !== VerificationStatus.OK) {
      throw new VerificationError('Invalid transfer transaction', result);
    }

    const transactions = this._transactions.slice();
    transactions.push(transaction);

    return new Token(this.genesis, transactions);
  }

  /**
   * Verify the genesis and every transfer in this token using the default
   * {@link TokenVerifier}. Kept for convenience and backwards compatibility; the
   * verification logic itself lives in {@link TokenVerifier} and can be swapped
   * for a platform-specific {@link ITokenVerifier}.
   *
   * @param {IVerificationContext} verificationContext Shared verification context (trust base + registries).
   * @returns {Promise<VerificationResult<VerificationStatus>>} Aggregated verification result.
   */
  public verify(verificationContext: IVerificationContext): Promise<VerificationResult<VerificationStatus>> {
    return new TokenVerifier().verify(this, verificationContext);
  }
}
