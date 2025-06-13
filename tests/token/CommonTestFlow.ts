import { InclusionProofVerificationStatus } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { DataHasherFactory } from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { NodeDataHasher } from '@unicitylabs/commons/lib/hash/NodeDataHasher.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { BigintConverter } from '@unicitylabs/commons/lib/util/BigintConverter.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';
import { Path } from '@unicitylabs/prefix-hash-tree/lib/smt.js';
import { SumPath } from '@unicitylabs/prefix-hash-tree/lib/sumtree.js';

import { DirectAddress } from '../../src/address/DirectAddress.js';
import { MaskedPredicate } from '../../src/predicate/MaskedPredicate.js';
import { PredicateFactory } from '../../src/predicate/PredicateFactory.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { CoinId } from '../../src/token/fungible/CoinId.js';
import { TokenCoinData } from '../../src/token/fungible/TokenCoinData.js';
import { Token } from '../../src/token/Token.js';
import { SplitProof, TokenFactory } from '../../src/token/TokenFactory.js';
import { TokenState } from '../../src/token/TokenState.js';
import { ITransactionJson, Transaction } from '../../src/transaction/Transaction.js';
import { ITransactionDataJson } from '../../src/transaction/TransactionData.js';
import { waitInclusionProof } from '../InclusionProofUtils.js';
import { createMintData, IMintData, mintToken, sendToken, createMintTokenDataForSplit } from '../MintTokenUtils.js';
import { TestTokenData } from '../TestTokenData.js';

const textEncoder = new TextEncoder();
const initialOwnerSecret = new TextEncoder().encode('secret');
const receiverSecret = new TextEncoder().encode('tere');
const sumTreeHasherFactory = new DataHasherFactory(NodeDataHasher);
const sumTreeHashAlgorithm = HashAlgorithm.SHA256;

export async function testTransferFlow(client: StateTransitionClient): Promise<void> {
  const data = await createMintData(
    initialOwnerSecret,
    new TokenCoinData([
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
    ]),
  );
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

  // Verify the original minted token has been spent
  const senderSigningService = await SigningService.createFromSecret(initialOwnerSecret, data.nonce);
  const mintedTokenStatus = await client.getTokenStatus(token, senderSigningService.publicKey);
  expect(mintedTokenStatus).toEqual(InclusionProofVerificationStatus.OK);

  // Verify the updated token has not been spent
  const transferredTokenStatus = await client.getTokenStatus(updateToken, signingService.publicKey);
  expect(transferredTokenStatus).toEqual(InclusionProofVerificationStatus.PATH_NOT_INCLUDED);
}

export async function testSplitFlow(client: StateTransitionClient): Promise<void> {
  // First, let's mint a token in the usual way.
  const unicityToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));
  const alphaToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));

  const coinData = new TokenCoinData([
    [unicityToken, 10n],
    [alphaToken, 20n],
  ]);
  const mintTokenData = await createMintData(initialOwnerSecret, coinData);
  const mintCommitment = await client.submitMintTransaction(
    await DirectAddress.create(mintTokenData.predicate.reference),
    mintTokenData.tokenId,
    mintTokenData.tokenType,
    mintTokenData.tokenData,
    mintTokenData.coinData,
    mintTokenData.salt,
    await new DataHasher(HashAlgorithm.SHA256).update(mintTokenData.data).digest(),
    null,
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
    new TokenCoinData([[alphaToken, 15n]]),
  ];

    const splitTokens = await splitToken(
        token,
        coinsPerNewTokens,
        initialOwnerSecret,
        mintTokenData.nonce,
        'my custom data',
        'my message',
        client
    );

    const signingService = await SigningService.createFromSecret(
        initialOwnerSecret,
        splitTokens[0].state.unlockPredicate.nonce
    );

    performCheckForSplitTokens(splitTokens,coinsPerNewTokens,signingService)

  console.log('******************************************* Split token 1 *******************************************');
  console.log(exportFlow(splitTokens[0], null, true));

  console.log('******************************************* Split token 2 *******************************************');
  console.log(exportFlow(splitTokens[1], null, true));

  const newTokenJson = exportFlow(splitTokens[0], null, true);
  const importedToken1 = await new TokenFactory(new PredicateFactory()).create(
    JSON.parse(newTokenJson).token,
    TestTokenData.fromJSON,
  );
}

export async function testSplitFlowAfterTransfer(client: StateTransitionClient): Promise<void> {
      const unicityToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));
      const alphaToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));

      const coinData = new TokenCoinData([
        [unicityToken, 100n],
        [alphaToken, 100n],
      ]);

      const mintTokenData = await createMintData(initialOwnerSecret, coinData);
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

      // Perfrom 1st split
      const coinsPerNewTokens = [
        new TokenCoinData([
          [unicityToken, 50n],
          [alphaToken, 50n],
        ]),
        new TokenCoinData([
            [unicityToken, 50n],
            [alphaToken, 50n],
        ])
      ];

      const splitTokens = await splitToken(
          token,
          coinsPerNewTokens,
          initialOwnerSecret,
          mintTokenData.nonce,
          'my custom data',
          'my message',
          client
      );

      const signingService = await SigningService.createFromSecret(
          initialOwnerSecret,
          splitTokens[0].state.unlockPredicate.nonce
      );

    performCheckForSplitTokens(splitTokens,coinsPerNewTokens,signingService)

    const receiverNonce = crypto.getRandomValues(new Uint8Array(32));
      const recipientSigningService = await SigningService.createFromSecret(receiverSecret, receiverNonce);

      const reference = await MaskedPredicate.calculateReference(
          splitTokens[0].type,
          "secp256k1",
          recipientSigningService.publicKey,
          HashAlgorithm.SHA256,
          receiverNonce
      );
      const recipientAddress = await DirectAddress.create(reference);

      // Create transfer transaction
      const sendTokenTx = await sendToken(
          client,
          splitTokens[0],
          await SigningService.createFromSecret(initialOwnerSecret, splitTokens[0].state.unlockPredicate.nonce),
          recipientAddress
      );

      //sender export token with transfer transaction
      const tokenJson = exportFlow(splitTokens[0], sendTokenTx, true);

      // Recipient imports token and transaction
      const receiverImportedToken = await new TokenFactory(new PredicateFactory()).create(
          JSON.parse(tokenJson).token,
          TestTokenData.fromJSON
      );

      const importedTransaction = await Transaction.fromJSON(
          receiverImportedToken.id,
          receiverImportedToken.type,
          JSON.parse(tokenJson).transaction as ITransactionJson<ITransactionDataJson>,
          new PredicateFactory(),
      );

      const maskedPredicate = await MaskedPredicate.create(
          receiverImportedToken.id,
          receiverImportedToken.type,
          recipientSigningService,
          HashAlgorithm.SHA256,
          receiverNonce,
      );

      // Finish the transaction with the recipient predicate
      const updateToken = await client.finishTransaction(
          receiverImportedToken,
          await TokenState.create(
              maskedPredicate,
              textEncoder.encode('my custom data')
          ),
          importedTransaction,
      );

      expect(receiverImportedToken.state.unlockPredicate.isOwner(recipientSigningService.publicKey)).toBeTruthy();
      expect(updateToken.id).toEqual(splitTokens[0].id);
      expect(updateToken.type).toEqual(splitTokens[0].type);
      expect(updateToken.data.toJSON()).toEqual(splitTokens[0].data.toJSON());
      expect(updateToken.coins?.toJSON()).toEqual(splitTokens[0].coins?.toJSON());

      // Now let's split that received token into 2 tokens.
      const coinsPerNewTokens2 = [
        new TokenCoinData([
          [unicityToken, 26n],
          [alphaToken, 27n],
        ]),
        new TokenCoinData([
          [unicityToken, 24n],
          [alphaToken, 23n],
        ])
      ];

      const splitTokens2 = await splitToken(
          updateToken,
          coinsPerNewTokens2,
          receiverSecret,
          receiverNonce,
          "my custom data",
          "my custom message",
          client
      );

      performCheckForSplitTokens(splitTokens2,coinsPerNewTokens2, recipientSigningService)
}

// TODO: Should this function be moved into a different location in the library?
function exportFlow(token, transaction, pretify) {
  const flow = { token, transaction };
  return pretify ? JSON.stringify(flow, null, 4) : JSON.stringify(flow);
}

async function splitToken(
    token, coinsPerNewTokens, ownerSecret, nonce, customDataString, customMessage, client: StateTransitionClient){
  const { commitment, recipientPredicate, newTokenIds, allCoinsTree, coinTrees }  = await client.submitBurnTransactionForSplit(
      token,
      coinsPerNewTokens,
      sumTreeHasherFactory,
      sumTreeHashAlgorithm,
      ownerSecret,
      nonce,
      await new DataHasher(HashAlgorithm.SHA256).update(
          textEncoder.encode(customDataString)
      ).digest(),
      textEncoder.encode(customMessage)
  );

  const transaction = await client.createTransaction(
      commitment,
      await waitInclusionProof(client, commitment)
  );

  const updatedToken = await client.finishTransaction(
      token,
      await TokenState.create(
          recipientPredicate,
          textEncoder.encode(customDataString)
      ),
      transaction,
  );

  const splitTokenData: IMintData[] = await Promise.all(
      coinsPerNewTokens.map(async (tokenCoinData, index) =>
          await createMintTokenDataForSplit(
              newTokenIds[index],
              ownerSecret,
              token.type,
              tokenCoinData
          )
      )
  );

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
      })
  );

  return splitTokens;
}

function performCheckForSplitTokens(
    actualTokens: Token<any, any>[], expectedCoinDataList: TokenCoinData[], signingService: SigningService,
) {
    expect(actualTokens.length).toEqual(expectedCoinDataList.length);

    actualTokens.forEach((actualToken, index) => {
        const expectedCoins = expectedCoinDataList[index].coins;

        const actualCoins = actualToken.coins?.coins;
        if (!actualCoins) {
            throw new Error(`actualToken at index ${index} has no coins`);
        }

        const expectedMap = new Map(
            expectedCoins.map(([id, amount]) => [id.toJSON(), amount]),
        );
        const actualMap = new Map(
            actualCoins.map(([id, amount]) => [id.toJSON(), amount]),
        );

        expect(actualMap).toEqual(expectedMap);
        expect(actualToken.state.unlockPredicate.isOwner(signingService.publicKey)).toBeTruthy();
    });
}