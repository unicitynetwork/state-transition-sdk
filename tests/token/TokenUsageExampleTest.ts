import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { NodeDataHasher } from '@unicitylabs/commons/lib/hash/NodeDataHasher.js';
import { DataHasherFactory } from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { SparseMerkleTree } from '@unicitylabs/commons/lib/smt/SparseMerkleTree.js';

import { DirectAddress } from '../../src/address/DirectAddress.js';
import { ISerializable } from '../../src/ISerializable.js';
import { MaskedPredicate } from '../../src/predicate/MaskedPredicate.js';
import { PredicateFactory } from '../../src/predicate/PredicateFactory.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { AggregatorClient } from '../../src/api/AggregatorClient.js';
import { CoinId } from '../../src/token/fungible/CoinId.js';
import { TokenCoinData } from '../../src/token/fungible/TokenCoinData.js';
import { ITokenJson, Token } from '../../src/token/Token.js';
import { SplitProof, TokenFactory, Uint8ArrayTokenData } from '../../src/token/TokenFactory.js';
import { TokenId } from '../../src/token/TokenId.js';
import { TokenState } from '../../src/token/TokenState.js';
import { TokenType } from '../../src/token/TokenType.js';
import { MintTransactionData } from '../../src/transaction/MintTransactionData.js';
import { ITransactionJson, Transaction } from '../../src/transaction/Transaction.js';
import { ITransactionDataJson, TransactionData } from '../../src/transaction/TransactionData.js';
import { waitInclusionProof } from '../InclusionProofUtils.js';
import { TestAggregatorClient } from '../TestAggregatorClient.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { HashOptions, Path } from '@unicitylabs/prefix-hash-tree/lib/smt.js';
import { BigintConverter } from '@unicitylabs/commons/lib/util/BigintConverter.js';
import { IPathJson, ISumPathJson } from '@unicitylabs/prefix-hash-tree/lib/index.js';
import { SumPath } from '@unicitylabs/prefix-hash-tree/lib/sumtree.js';
import { TestTokenData } from '../TestTokenData.js';

const textEncoder = new TextEncoder();

interface IMintData {
  tokenId: TokenId;
  tokenType: TokenType;
  tokenData: Uint8ArrayTokenData;
  coinData: TokenCoinData;
  data: Uint8Array;
  salt: Uint8Array;
  nonce: Uint8Array;
  predicate: MaskedPredicate;
}

async function createMintData(secret: Uint8Array, coinData: TokenCoinData): Promise<IMintData> {
  const tokenId = TokenId.create(crypto.getRandomValues(new Uint8Array(32)));
  const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(32)));
  const tokenData = new Uint8ArrayTokenData(crypto.getRandomValues(new Uint8Array(32)));
  
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

async function createMintTokenDataForSplit(tokenId: TokenId, secret: Uint8Array, tokenType: TokenType, coinData: TokenCoinData): Promise<IMintTokenData> {
  const tokenData = new Uint8ArrayTokenData(crypto.getRandomValues(new Uint8Array(32)));

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

async function sendToken(
  client: StateTransitionClient,
  token: Token<ISerializable, MintTransactionData<ISerializable | null>>,
  signingService: SigningService,
  recipient: DirectAddress,
): Promise<Transaction<TransactionData>> {
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

const initialOwnerSecret = new TextEncoder().encode('secret');
const receiverSecret = new TextEncoder().encode('tere');

describe('Transition', function () {
  it('should verify the token latest state', async () => {
    const client = new StateTransitionClient(new TestAggregatorClient(new SparseMerkleTree(HashAlgorithm.SHA256)));
    const data = await createMintData(initialOwnerSecret, new TokenCoinData([
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
    ]));
    const token = await mintToken(client, data);
    await expect(DirectAddress.create(data.predicate.reference)).resolves.toEqual(
      await DirectAddress.fromJSON(token.transactions[0].data.recipient),
    );

    // Recipient prepares the info for the transfer
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const signingservice = await SigningService.createFromSecret(receiverSecret, nonce);
    const recipientPredicate = await MaskedPredicate.create(
      token.id,
      token.type,
      signingservice,
      HashAlgorithm.SHA256,
      nonce,
    );

    // Create transfer transaction
    const transaction = await sendToken(
      client,
      token,
      await SigningService.createFromSecret(initialOwnerSecret, data.nonce),
      await DirectAddress.create(recipientPredicate.reference),
    );

    const tokenFactory = new TokenFactory(new PredicateFactory());

    // Recipient imports token
    const importedToken = await tokenFactory.create(token.toJSON(), TestTokenData.fromJSON);
    // Recipient gets transaction from sender
    const importedTransaction = await Transaction.fromJSON(
      importedToken.id,
      importedToken.type,
      transaction.toJSON() as ITransactionJson<ITransactionDataJson>,
      new PredicateFactory(),
    );

    // Finish the transaction with the recipient predicate
    const updateToken = await client.finishTransaction(
      importedToken,
      await TokenState.create(recipientPredicate, textEncoder.encode('my custom data')),
      importedTransaction,
    );

    const signingService = await SigningService.createFromSecret(receiverSecret, token.state.unlockPredicate.nonce);
    expect(importedToken.state.unlockPredicate.isOwner(signingService.publicKey)).toBeTruthy();
    expect(updateToken.id).toEqual(token.id);
    expect(updateToken.type).toEqual(token.type);
    expect(updateToken.data.toJSON()).toEqual(token.data.toJSON());
    expect(updateToken.coins?.toJSON()).toEqual(token.coins?.toJSON());

    console.log(JSON.stringify(updateToken.toJSON()));
  }, 15000);
<<<<<<< HEAD

  it('should split tokens', async () => {
    // First, let's mint a token in the usual way.
    const sumTreeHasherFactory = new DataHasherFactory(NodeDataHasher);
    const sumTreeHashAlgorithm = HashAlgorithm.SHA256;

    const client = new StateTransitionClient(
      new TestAggregatorClient(new SparseMerkleTree(HashAlgorithm.SHA256)),
    );
    const secret = new TextEncoder().encode('secret');

    const unicityToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));
    const alphaToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));

    const coinData = new TokenCoinData([
      [unicityToken, 10n],
      [alphaToken, 20n],
    ]);
    const mintTokenData = await createMintTokenData(secret, coinData);
    const mintCommitment = await client.submitMintTransaction(
      await DirectAddress.create(mintTokenData.predicate.reference),
      mintTokenData.tokenId,
      mintTokenData.tokenType,
      mintTokenData.tokenData,
      mintTokenData.coinData,
      mintTokenData.salt,
      await new DataHasher(HashAlgorithm.SHA256).update(mintTokenData.data).digest(),
      null
    );

    const mintTransaction = await client.createTransaction(
      mintCommitment,
      await waitInclusionProof(client, mintCommitment),
    );

    const token = new Token(
      mintTokenData.tokenId,
      mintTokenData.tokenType,
      mintTokenData.tokenData,
      mintTokenData.coinData,
      await TokenState.create(mintTokenData.predicate, mintTokenData.data),
      [mintTransaction],
    );

    // Now let's split that token into 2 tokens.

    const coinsPerNewTokens = [
      new TokenCoinData([
        [unicityToken, 10n],
        [alphaToken, 5n],
      ]),
      new TokenCoinData([
        [alphaToken, 15n],
      ])
    ];

    const { commitment, recipientPredicate, newTokenIds, allCoinsTree, coinTrees }  = await client.submitBurnTransactionForSplit(
        token, 
        coinsPerNewTokens, 
        sumTreeHasherFactory, 
        sumTreeHashAlgorithm, 
        secret, 
        mintTokenData.nonce,     
        await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode('my custom data')).digest(),
        textEncoder.encode('my message'));

    const transaction = await client.createTransaction(commitment, await waitInclusionProof(client, commitment));

    const updatedToken = await client.finishTransaction(
      token,
      await TokenState.create(recipientPredicate, textEncoder.encode('my custom data')),
      transaction,
    );

    const splitTokenData: IMintTokenData[] = await Promise.all(coinsPerNewTokens.map(async (tokenCoinData, index) =>
      await createMintTokenDataForSplit(newTokenIds[index], secret, mintTokenData.tokenType, tokenCoinData)));

    const splitTokens = await Promise.all(
      splitTokenData.map(async tokenData => {
        const burnProofs: Map<string, [Path, SumPath]> = new Map();
        for (let [coinId, amount] of tokenData.coinData.coins) {
          const pathToCoinTree = await allCoinsTree.getProof(BigintConverter.decode(HexConverter.decode(coinId.toJSON())));
          const pathToCoinAmount = await coinTrees.get(coinId.toJSON())!.getProof(BigintConverter.decode(HexConverter.decode(tokenData.tokenId.toJSON())));
          burnProofs.set(coinId.toJSON(), [pathToCoinTree, pathToCoinAmount]);
        }

        const mintCommitment = await client.submitMintTransaction(
          await DirectAddress.create(tokenData.predicate.reference),
          tokenData.tokenId,
          tokenData.tokenType,
          tokenData.tokenData,
          tokenData.coinData,
          tokenData.salt,
          await new DataHasher(HashAlgorithm.SHA256).update(tokenData.data).digest(),
          new SplitProof(updatedToken, burnProofs)
        );
        const mintTransaction = await client.createTransaction(
          mintCommitment,
          await waitInclusionProof(client, mintCommitment),
        );
        return new Token(
          tokenData.tokenId,
          tokenData.tokenType,
          tokenData.tokenData,
          tokenData.coinData,
          await TokenState.create(tokenData.predicate, tokenData.data),
          [mintTransaction],
        );
      }));

    expect(splitTokens.length).toEqual(2);

    expect(splitTokens[0]!.coins!.toString()).toEqual(
      dedent`
        FungibleTokenData
          ${unicityToken.toJSON()}: 10
          ${alphaToken.toJSON()}: 5`);

    expect(splitTokens[1]!.coins!.toString()).toEqual(
      dedent`
        FungibleTokenData
          ${alphaToken.toJSON()}: 15`);

    console.log('******************************************* Split token 1 *******************************************');
    console.log(exportFlow(splitTokens[0], null, true));

    console.log('******************************************* Split token 2 *******************************************');
    console.log(exportFlow(splitTokens[1], null, true));

    const newTokenJson = exportFlow(splitTokens[0], null, true);
    const importedToken1 = await new TokenFactory(new PredicateFactory()).create(
      JSON.parse(newTokenJson).token,
      Uint8ArrayTokenData.fromJSON);
  }, 150000);

  // TODO: Should this function be moved into a different location in the library?
  function exportFlow(token, transaction, pretify){
    const flow = {token, transaction}
    return pretify?JSON.stringify(flow, null, 4):JSON.stringify(flow);
  }
});
