import { InclusionProof, InclusionProofVerificationStatus } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { DirectAddress } from '../address/DirectAddress.js';
import { ISerializable } from '../ISerializable.js';
import { MINT_SUFFIX, MINTER_SECRET } from '../StateTransitionClient.js';
import { ITokenJson, Token, TOKEN_VERSION } from './Token.js';
import { TokenId } from './TokenId.js';
import { TokenState } from './TokenState.js';
import { TokenType } from './TokenType.js';
import { IPredicateFactory } from '../predicate/IPredicateFactory.js';
import { IMintTransactionDataJson, MintTransactionData } from '../transaction/MintTransactionData.js';
import { ITransactionJson, Transaction } from '../transaction/Transaction.js';
import { ITransactionDataJson, TransactionData } from '../transaction/TransactionData.js';
import { TokenCoinData } from './fungible/TokenCoinData.js';

/**
 * Utility for constructing tokens from their serialized form.
 */
export class TokenFactory {
  /**
   * @param predicateFactory Factory used to deserialize predicates
   */
  public constructor(private readonly predicateFactory: IPredicateFactory) {}

  /**
   * Deserialize a token from JSON.
   *
   * @param data       Token JSON representation
   * @param createData Callback producing the custom token data object
   */
  public async create<TD extends ISerializable>(
    data: ITokenJson,
    createData: (data: unknown) => Promise<TD>,
  ): Promise<Token<TD, MintTransactionData<ISerializable | null>>> {
    const tokenVersion = data.version;
    if (tokenVersion !== TOKEN_VERSION) {
      throw new Error('Cannot parse token. Version mismatch.');
    }

    const tokenId = TokenId.create(HexConverter.decode(data.id));
    const tokenType = TokenType.create(HexConverter.decode(data.type));
    const tokenData = await createData(data.data);
    const coinData = data.coins ? TokenCoinData.fromJSON(data.coins) : null;

    const mintTransaction = await this.createMintTransaction(
      tokenId,
      tokenType,
      tokenData,
      coinData,
      await RequestId.createFromImprint(tokenId.encode(), MINT_SUFFIX),
      data.transactions[0],
    );

    const signingService = await SigningService.createFromSecret(MINTER_SECRET, tokenId.encode());

    if (!(await this.verifyMintTransaction(mintTransaction, signingService.publicKey))) {
      throw new Error('Mint transaction verification failed.');
    }

    const transactions: [Transaction<MintTransactionData<ISerializable | null>>, ...Transaction<TransactionData>[]] = [
      mintTransaction,
    ];
    let previousTransaction: Transaction<MintTransactionData<ISerializable | null> | TransactionData> = mintTransaction;
    for (let i = 1; i < data.transactions.length; i++) {
      const transaction = await this.createTransaction(
        tokenId,
        tokenType,
        data.transactions[i] as ITransactionJson<ITransactionDataJson>,
      );

      // TODO: Move address processing to a separate method
      const expectedRecipient = await DirectAddress.create(transaction.data.sourceState.unlockPredicate.reference);
      if (expectedRecipient.toJSON() !== previousTransaction.data.recipient) {
        throw new Error('Recipient address mismatch');
      }

      if (!(await previousTransaction.containsData(transaction.data.sourceState.data))) {
        throw new Error('State data is not part of transaction.');
      }

      if (!(await transaction.data.sourceState.unlockPredicate.verify(transaction))) {
        throw new Error('Predicate verification failed');
      }

      transactions.push(transaction);
      previousTransaction = transaction;
    }

    const state = await TokenState.create(
      await this.predicateFactory.create(tokenId, tokenType, data.state.unlockPredicate),
      data.state.data ? HexConverter.decode(data.state.data) : null,
    );

    if (!(await previousTransaction.containsData(state.data))) {
      throw new Error('State data is not part of transaction.');
    }

    const expectedRecipient = await DirectAddress.create(state.unlockPredicate.reference);
    if (expectedRecipient.toJSON() !== previousTransaction.data.recipient) {
      throw new Error('Recipient address mismatch');
    }

    // TODO: Add nametag tokens
    return new Token(tokenId, tokenType, tokenData, coinData, state, transactions, [], tokenVersion);
  }

  /**
   * Build a mint transaction object from serialized data.
   */
  public async createMintTransaction(
    tokenId: TokenId,
    tokenType: TokenType,
    tokenData: ISerializable,
    coinData: TokenCoinData | null,
    sourceState: RequestId,
    transaction: ITransactionJson<IMintTransactionDataJson>,
  ): Promise<Transaction<MintTransactionData<ISerializable | null>>> {
    return new Transaction(
      await MintTransactionData.create(
        tokenId,
        tokenType,
        tokenData,
        coinData,
        sourceState,
        transaction.data.recipient,
        HexConverter.decode(transaction.data.salt),
        transaction.data.dataHash ? DataHash.fromJSON(transaction.data.dataHash) : null,
        // TODO: Parse reason properly
        transaction.data.reason ? this.createMintReason(transaction.data.reason) : null,
      ),
      InclusionProof.fromJSON(transaction.inclusionProof),
    );
  }

  /** Parse the reason field of a mint transaction (not yet implemented). */
  private createMintReason(data: unknown): ISerializable {
    if (typeof data !== 'object' || data == null || !('type' in data)) {
      throw new Error('MintReason: data is not an object');
    }

    switch (data.type) {
      default:
        throw new Error('NOT IMPLEMENTED');
    }
  }

  /**
   * Internal helper to reconstruct a normal transaction from JSON.
   */
  private async createTransaction(
    tokenId: TokenId,
    tokenType: TokenType,
    { data, inclusionProof }: ITransactionJson<ITransactionDataJson>,
  ): Promise<Transaction<TransactionData>> {
    return new Transaction(
      await TransactionData.create(
        await TokenState.create(
          await this.predicateFactory.create(tokenId, tokenType, data.sourceState.unlockPredicate),
          data.sourceState.data ? HexConverter.decode(data.sourceState.data) : null,
        ),
        data.recipient,
        HexConverter.decode(data.salt),
        data.dataHash ? DataHash.fromJSON(data.dataHash) : null,
        data.message ? HexConverter.decode(data.message) : null,
        [], //await Promise.all(data.nameTags.map((input) => this.importToken(input, NameTagTokenData, predicateFactory))),
      ),
      InclusionProof.fromJSON(inclusionProof),
    );
  }

  /** Validate a mint transaction against a public key. */
  private async verifyMintTransaction(
    transaction: Transaction<MintTransactionData<ISerializable | null>>,
    publicKey: Uint8Array,
  ): Promise<boolean> {
    if (!transaction.inclusionProof.authenticator || !transaction.inclusionProof.transactionHash) {
      return false;
    }

    if (
      HexConverter.encode(transaction.inclusionProof.authenticator.publicKey) !== HexConverter.encode(publicKey) ||
      !transaction.inclusionProof.authenticator.stateHash.equals(transaction.data.sourceState.hash)
    ) {
      return false; // input mismatch
    }

    // Verify if transaction data is valid.
    if (!(await transaction.inclusionProof.authenticator.verify(transaction.data.hash))) {
      return false;
    }

    // Verify inclusion proof path.
    const requestId = await RequestId.create(publicKey, transaction.data.sourceState.hash);
    const status = await transaction.inclusionProof.verify(requestId.toBigInt());
    return status === InclusionProofVerificationStatus.OK;
  }
}
