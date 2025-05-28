import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { DirectAddress } from '../address/DirectAddress.js';
import { ISerializable } from '../ISerializable.js';
import { MINT_SUFFIX, MINTER_SECRET } from '../StateTransitionClient.js';
import { ITokenDto, Token, TOKEN_VERSION } from './Token.js';
import { TokenId } from './TokenId.js';
import { TokenState } from './TokenState.js';
import { TokenType } from './TokenType.js';
import { IPredicateFactory } from '../predicate/IPredicateFactory.js';
import { IMintTransactionDataDto, MintTransactionData } from '../transaction/MintTransactionData.js';
import { ITransactionDto, Transaction } from '../transaction/Transaction.js';
import { ITransactionDataDto, TransactionData } from '../transaction/TransactionData.js';
import { TokenCoinData } from './fungible/TokenCoinData.js';

export class TokenFactory {
  public constructor(private readonly predicateFactory: IPredicateFactory) {}

  public async create<TD extends ISerializable>(
    data: ITokenDto,
    createData: (data: Uint8Array) => Promise<TD>,
  ): Promise<Token<TD, MintTransactionData<ISerializable | null>>> {
    const tokenVersion = data.version;
    if (tokenVersion !== TOKEN_VERSION) {
      throw new Error('Cannot parse token. Version mismatch.');
    }

    const tokenId = TokenId.create(HexConverter.decode(data.id));
    const tokenType = TokenType.create(HexConverter.decode(data.type));
    const tokenData = await createData(HexConverter.decode(data.data));
    const coinData = data.coins ? TokenCoinData.decode(HexConverter.decode(data.coins)) : null;

    const mintTransaction = await this.createMintTransaction(
      tokenId,
      tokenType,
      tokenData,
      coinData,
      await RequestId.createFromImprint(tokenId.encode(), MINT_SUFFIX),
      data.transactions[0],
    );

    const signingService = await SigningService.createFromSecret(MINTER_SECRET, tokenId.encode());

    const requestId = await RequestId.create(signingService.publicKey, mintTransaction.data.sourceState.hash);
    if (!(await mintTransaction.inclusionProof.verify(requestId.toBigInt()))) {
      throw new Error('Mint inclusion proof verification failed.');
    }

    const transactions: [Transaction<MintTransactionData<ISerializable | null>>, ...Transaction<TransactionData>[]] = [
      mintTransaction,
    ];
    let previousTransaction: Transaction<MintTransactionData<ISerializable | null> | TransactionData> = mintTransaction;
    for (let i = 1; i < data.transactions.length; i++) {
      const transaction = await this.createTransaction(
        tokenId,
        tokenType,
        data.transactions[i] as ITransactionDto<ITransactionDataDto>,
      );

      // TODO: Move address processing to a separate method
      const expectedRecipient = await DirectAddress.create(
        transaction.data.sourceState.unlockPredicate.reference.imprint,
      );
      if (expectedRecipient.toDto() !== previousTransaction.data.recipient) {
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

    const expectedRecipient = await DirectAddress.create(state.unlockPredicate.reference.imprint);
    if (expectedRecipient.toDto() !== previousTransaction.data.recipient) {
      throw new Error('Recipient address mismatch');
    }

    // TODO: Add nametag tokens
    return new Token(tokenId, tokenType, tokenData, coinData, state, transactions, [], tokenVersion);
  }

  public async createMintTransaction(
    tokenId: TokenId,
    tokenType: TokenType,
    tokenData: ISerializable,
    coinData: TokenCoinData | null,
    sourceState: RequestId,
    transaction: ITransactionDto<IMintTransactionDataDto>,
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
        transaction.data.reason ? this.createMintReason(HexConverter.decode(transaction.data.reason)) : null,
      ),
      InclusionProof.fromJSON(transaction.inclusionProof),
    );
  }

  private createMintReason(bytes: Uint8Array): ISerializable {
    const data = CborDecoder.readArray(bytes);
    const type = CborDecoder.readTextString(data[0]);
    switch (type) {
      default:
        throw new Error('NOT IMPLEMENTED');
    }
  }

  private async createTransaction(
    tokenId: TokenId,
    tokenType: TokenType,
    { data, inclusionProof }: ITransactionDto<ITransactionDataDto>,
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
}
