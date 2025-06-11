import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';

import { waitInclusionProof } from './InclusionProofUtils.js';
import { TestTokenData } from './TestTokenData.js';
import { DirectAddress } from '../src/address/DirectAddress.js';
import { ISerializable } from '../src/ISerializable.js';
import { MaskedPredicate } from '../src/predicate/MaskedPredicate.js';
import { StateTransitionClient } from '../src/StateTransitionClient.js';
import { TokenCoinData } from '../src/token/fungible/TokenCoinData.js';
import { Token } from '../src/token/Token.js';
import { TokenId } from '../src/token/TokenId.js';
import { TokenState } from '../src/token/TokenState.js';
import { TokenType } from '../src/token/TokenType.js';
import { MintTransactionData } from '../src/transaction/MintTransactionData.js';
import { Transaction } from '../src/transaction/Transaction.js';
import { TransactionData } from '../src/transaction/TransactionData.js';

export interface IMintData {
  tokenId: TokenId;
  tokenType: TokenType;
  tokenData: TestTokenData;
  coinData: TokenCoinData;
  data: Uint8Array;
  salt: Uint8Array;
  nonce: Uint8Array;
  predicate: MaskedPredicate;
}

export async function createMintData(secret: Uint8Array, coinData: TokenCoinData): Promise<IMintData> {
  const tokenId = TokenId.create(crypto.getRandomValues(new Uint8Array(32)));
  const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(32)));
  const tokenData = new TestTokenData(crypto.getRandomValues(new Uint8Array(32)));

  const data = crypto.getRandomValues(new Uint8Array(32));

  const salt = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(32));

  const predicate = await MaskedPredicate.create(
    tokenId,
    tokenType,
    await SigningService.createFromSecret(secret, nonce),
    HashAlgorithm.SHA256,
    nonce,
  );

  return {
    coinData,
    data,
    nonce,
    predicate,
    salt,
    tokenData,
    tokenId,
    tokenType,
  };
}

export async function createMintTokenDataForSplit(
  tokenId: TokenId,
  secret: Uint8Array,
  tokenType: TokenType,
  coinData: TokenCoinData,
): Promise<IMintData> {
  const tokenData = new TestTokenData(crypto.getRandomValues(new Uint8Array(32)));

  const data = crypto.getRandomValues(new Uint8Array(32));

  const salt = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(32));

  const signingService = await SigningService.createFromSecret(secret, nonce);
  const predicate = await MaskedPredicate.create(tokenId, tokenType, signingService, HashAlgorithm.SHA256, nonce);

  return {
    coinData,
    data,
    nonce,
    predicate,
    salt,
    tokenData,
    tokenId,
    tokenType,
  };
}

export async function mintToken(
  client: StateTransitionClient,
  data: IMintData,
): Promise<Token<TestTokenData, MintTransactionData<null>>> {
  const mintCommitment = await client.submitMintTransaction(
    await DirectAddress.create(data.predicate.reference),
    data.tokenId,
    data.tokenType,
    data.tokenData,
    data.coinData,
    data.salt,
    await new DataHasher(HashAlgorithm.SHA256).update(data.data).digest(),
    null,
  );

  const mintTransaction = await client.createTransaction(
    mintCommitment,
    await waitInclusionProof(client, mintCommitment),
  );

  return new Token(
    data.tokenId,
    data.tokenType,
    data.tokenData,
    data.coinData,
    await TokenState.create(data.predicate, data.data),
    [mintTransaction],
  );
}

export async function sendToken(
  client: StateTransitionClient,
  token: Token<ISerializable, MintTransactionData<ISerializable | null>>,
  signingService: SigningService,
  recipient: DirectAddress,
): Promise<Transaction<TransactionData>> {
  const textEncoder = new TextEncoder();
  const transactionData = await TransactionData.create(
    token.state,
    recipient.toJSON(),
    crypto.getRandomValues(new Uint8Array(32)),
    await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode('my custom data')).digest(),
    textEncoder.encode('my message'),
    token.nametagTokens,
  );

  const commitment = await client.submitTransaction(transactionData, signingService);
  return await client.createTransaction(commitment, await waitInclusionProof(client, commitment));
}
