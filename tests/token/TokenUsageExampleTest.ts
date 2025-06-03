import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { SparseMerkleTree } from '@unicitylabs/commons/lib/smt/SparseMerkleTree.js';

import { DirectAddress } from '../../src/address/DirectAddress.js';
import { ISerializable } from '../../src/ISerializable.js';
import { MaskedPredicate } from '../../src/predicate/MaskedPredicate.js';
import { PredicateFactory } from '../../src/predicate/PredicateFactory.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { CoinId } from '../../src/token/fungible/CoinId.js';
import { TokenCoinData } from '../../src/token/fungible/TokenCoinData.js';
import { Token } from '../../src/token/Token.js';
import { TokenFactory } from '../../src/token/TokenFactory.js';
import { TokenId } from '../../src/token/TokenId.js';
import { TokenState } from '../../src/token/TokenState.js';
import { TokenType } from '../../src/token/TokenType.js';
import { MintTransactionData } from '../../src/transaction/MintTransactionData.js';
import { TransactionData } from '../../src/transaction/TransactionData.js';
import { waitInclusionProof } from '../InclusionProofUtils.js';
import { TestAggregatorClient } from '../TestAggregatorClient.js';
import { TestTokenData } from '../TestTokenData.js';

const textEncoder = new TextEncoder();

interface IMintData {
  tokenId: TokenId;
  tokenType: TokenType;
  tokenData: TestTokenData;
  coinData: TokenCoinData;
  data: Uint8Array;
  salt: Uint8Array;
  nonce: Uint8Array;
  predicate: MaskedPredicate;
}

async function createMintData(secret: Uint8Array): Promise<IMintData> {
  const tokenId = TokenId.create(crypto.getRandomValues(new Uint8Array(32)));
  const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(32)));
  const tokenData = new TestTokenData(crypto.getRandomValues(new Uint8Array(32)));
  const coinData = new TokenCoinData([
    [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
    [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
  ]);
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

async function mintToken(
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

async function sendToken<T extends ISerializable, U extends MintTransactionData<ISerializable | null>>(
  client: StateTransitionClient,
  token: Token<T, U>,
  signingService: SigningService,
): Promise<Token<T, U>> {
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const signingservice = await SigningService.createFromSecret(receiverSecret, nonce);
  const recipientPredicate = await MaskedPredicate.create(
    token.id,
    token.type,
    signingservice,
    HashAlgorithm.SHA256,
    nonce,
  );
  const recipient = await DirectAddress.create(recipientPredicate.reference);

  const transactionData = await TransactionData.create(
    token.state,
    recipient.toJSON(),
    crypto.getRandomValues(new Uint8Array(32)),
    await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode('my custom data')).digest(),
    textEncoder.encode('my message'),
    token.nametagTokens,
  );

  const commitment = await client.submitTransaction(transactionData, signingService);
  const transaction = await client.createTransaction(commitment, await waitInclusionProof(client, commitment));

  return client.finishTransaction(
    token,
    await TokenState.create(recipientPredicate, textEncoder.encode('my custom data')),
    transaction,
  );
}

const initialOwnerSecret = new TextEncoder().encode('secret');
const receiverSecret = new TextEncoder().encode('tere');

describe('Transition', function () {
  it('should verify the token latest state', async () => {
    const client = new StateTransitionClient(new TestAggregatorClient(new SparseMerkleTree(HashAlgorithm.SHA256)));
    const data = await createMintData(initialOwnerSecret);
    const token = await mintToken(client, data);
    const updateToken = await sendToken(
      client,
      token,
      await SigningService.createFromSecret(initialOwnerSecret, data.nonce),
    );

    expect(updateToken.id).toEqual(token.id);
    expect(updateToken.type).toEqual(token.type);
    expect(updateToken.data.toJSON()).toEqual(token.data.toJSON());
    expect(updateToken.coins?.toJSON()).toEqual(token.coins?.toJSON());

    console.log(JSON.stringify(updateToken.toJSON()));
  }, 15000);

  it('should import token', async () => {
    const client = new StateTransitionClient(new TestAggregatorClient(new SparseMerkleTree(HashAlgorithm.SHA256)));
    const data = await createMintData(initialOwnerSecret);
    const token = await sendToken(
      client,
      await mintToken(client, data),
      await SigningService.createFromSecret(initialOwnerSecret, data.nonce),
    );

    const importedToken = await new TokenFactory(new PredicateFactory()).create(token.toJSON(), TestTokenData.fromJSON);
    const signingService = await SigningService.createFromSecret(receiverSecret, token.state.unlockPredicate.nonce);

    expect(importedToken.state.unlockPredicate.isOwner(signingService.publicKey)).toBeTruthy();
  }, 15000);
});
