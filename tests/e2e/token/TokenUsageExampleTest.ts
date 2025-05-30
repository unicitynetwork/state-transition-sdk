import { InclusionProof, InclusionProofVerificationStatus } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { JsonRpcNetworkError } from '@unicitylabs/commons/lib/json-rpc/JsonRpcNetworkError.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';

import { DirectAddress } from '../../../src/address/DirectAddress.js';
import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { ISerializable } from '../../../src/ISerializable.js';
import { MaskedPredicate } from '../../../src/predicate/MaskedPredicate.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { CoinId } from '../../../src/token/fungible/CoinId.js';
import { TokenCoinData } from '../../../src/token/fungible/TokenCoinData.js';
import { Token } from '../../../src/token/Token.js';
import { TokenId } from '../../../src/token/TokenId.js';
import { TokenState } from '../../../src/token/TokenState.js';
import { TokenType } from '../../../src/token/TokenType.js';
import { Commitment } from '../../../src/transaction/Commitment.js';
import { MintTransactionData } from '../../../src/transaction/MintTransactionData.js';
import { TransactionData } from '../../../src/transaction/TransactionData.js';
import { TestTokenData } from '../../TestTokenData.js';

const textEncoder = new TextEncoder();

interface IMintTokenData {
  tokenId: TokenId;
  tokenType: TokenType;
  tokenData: TestTokenData;
  coinData: TokenCoinData;
  data: Uint8Array;
  salt: Uint8Array;
  nonce: Uint8Array;
  predicate: MaskedPredicate;
}

class SleepError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SleepError';
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function waitInclusionProof(
  client: StateTransitionClient,
  commitment: Commitment<TransactionData | MintTransactionData<ISerializable | null>>,
  signal: AbortSignal = AbortSignal.timeout(10000),
  interval: number = 1000,
): Promise<InclusionProof> {
  while (true) {
    try {
      const inclusionProof = await client.getInclusionProof(commitment);
      if ((await inclusionProof.verify(commitment.requestId.toBigInt())) === InclusionProofVerificationStatus.OK) {
        return inclusionProof;
      }
    } catch (err) {
      if (!(err instanceof JsonRpcNetworkError && err.status === 404)) {
        throw err;
      }
    }

    try {
      await sleep(interval, signal);
    } catch (err) {
      throw new SleepError(String(err || 'Sleep was aborted'));
    }
  }
}

async function createMintTokenData(secret: Uint8Array): Promise<IMintTokenData> {
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

describe('Transition', function () {
  it('mint, transfer and verify', async () => {
    const aggregatorUrl = process.env.AGGREGATOR_URL ?? 'http://127.0.0.1:80';
    console.log('connecting to aggregator url: ' + aggregatorUrl);
    const client = new StateTransitionClient(new AggregatorClient(aggregatorUrl));
    const secret = new TextEncoder().encode('secret');
    const mintTokenData = await createMintTokenData(secret);
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

    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const signingservice = await SigningService.createFromSecret(new TextEncoder().encode('tere'), nonce);
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

    const commitment = await client.submitTransaction(
      transactionData,
      await SigningService.createFromSecret(secret, mintTokenData.predicate.nonce),
    );
    const transaction = await client.createTransaction(commitment, await waitInclusionProof(client, commitment));

    const updateToken = await client.finishTransaction(
      token,
      await TokenState.create(recipientPredicate, textEncoder.encode('my custom data')),
      transaction,
    );

    console.log(JSON.stringify(updateToken.toJSON()));
  }, 15000);
});
