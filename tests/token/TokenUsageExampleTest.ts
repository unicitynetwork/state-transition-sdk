import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { JsonRpcNetworkError } from '@unicitylabs/commons/lib/json-rpc/JsonRpcNetworkError.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { SparseMerkleTree } from '@unicitylabs/commons/lib/smt/SparseMerkleTree.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { DirectAddress } from '../../src/address/DirectAddress.js';
import { ISerializable } from '../../src/ISerializable.js';
import { MaskedPredicate } from '../../src/predicate/MaskedPredicate.js';
import { PredicateFactory } from '../../src/predicate/PredicateFactory.js';
import { UnmaskedPredicate } from '../../src/predicate/UnmaskedPredicate.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { CoinId } from '../../src/token/fungible/CoinId.js';
import { TokenCoinData } from '../../src/token/fungible/TokenCoinData.js';
import { Token } from '../../src/token/Token.js';
import { TokenFactory } from '../../src/token/TokenFactory.js';
import { TokenId } from '../../src/token/TokenId.js';
import { TokenState } from '../../src/token/TokenState.js';
import { TokenType } from '../../src/token/TokenType.js';
import { Commitment } from '../../src/transaction/Commitment.js';
import { MintTransactionData } from '../../src/transaction/MintTransactionData.js';
import { TransactionData } from '../../src/transaction/TransactionData.js';
import { TestAggregatorClient } from '../TestAggregatorClient.js';

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

function waitInclusionProof(
  client: StateTransitionClient,
  commitment: Commitment<TransactionData | MintTransactionData<ISerializable | null>>,
  signal: AbortSignal = AbortSignal.timeout(10000),
  interval: number = 1000,
): Promise<InclusionProof> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | number;
    const abortListener = (): void => {
      signal.removeEventListener('abort', abortListener);
      clearTimeout(timeoutId);
      reject(signal.reason);
    };

    signal.addEventListener('abort', abortListener);

    const fetchProof = (): void => {
      client
        .getInclusionProof(commitment)
        .then((proof) => {
          if (proof !== null) {
            signal.removeEventListener('abort', abortListener);
            clearTimeout(timeoutId);
            return resolve(proof);
          }

          timeoutId = setTimeout(fetchProof, interval);
        })
        .catch((err) => {
          if (err instanceof JsonRpcNetworkError && err.status === 404) {
            timeoutId = setTimeout(fetchProof, interval);
          } else {
            throw err;
          }
        });
    };

    fetchProof();
  });
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

describe('Transition', function () {
  it('should verify the token latest state', async () => {
    const client = new StateTransitionClient(new TestAggregatorClient(new SparseMerkleTree(HashAlgorithm.SHA256)));
    const secret = new TextEncoder().encode('secret');
    const mintTokenData = await createMintTokenData(secret);
    const mintCommitment = await client.submitMintTransaction(
      await DirectAddress.create(mintTokenData.predicate.reference.imprint),
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
    const recipientPredicate = await MaskedPredicate.create(
      token.id,
      token.type,
      await SigningService.createFromSecret(new TextEncoder().encode('tere'), nonce),
      HashAlgorithm.SHA256,
      nonce,
    );
    const recipient = await DirectAddress.create(recipientPredicate.reference.imprint);

    const transactionData = await TransactionData.create(
      token.state,
      recipient.toDto(),
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

    console.log(JSON.stringify(updateToken.toDto()));
  }, 15000);

  it('should verify MaskedPredicate and UnmaskedPredicate reference calculation', async () => {
    const client = new StateTransitionClient(new TestAggregatorClient(new SparseMerkleTree(HashAlgorithm.SHA256)));
    
    // First, create a token from scratch with our modified MaskedPredicate implementation
    const mintTokenData = await createMintTokenData(textEncoder.encode('token-secret'));
    
    // Mint a new token
    const mintCommitment = await client.submitMintTransaction(
      await DirectAddress.create(mintTokenData.predicate.reference.imprint),
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

    // Create the initial token
    let token = new Token(
      mintTokenData.tokenId,
      mintTokenData.tokenType,
      mintTokenData.tokenData,
      mintTokenData.coinData,
      await TokenState.create(mintTokenData.predicate, mintTokenData.data),
      [mintTransaction],
    );
    
    // Create a recipient predicate using UnmaskedPredicate
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const recipientPredicate = await UnmaskedPredicate.create(
      token.id,
      token.type,
      await SigningService.createFromSecret(textEncoder.encode('recipient-secret')),
      HashAlgorithm.SHA256,
      salt,
    );
    
    // Create a direct address for the recipient using the reference
    const recipient = await DirectAddress.create(recipientPredicate.reference.imprint);

    // Create transaction data
    const transactionData = await TransactionData.create(
      token.state,
      recipient.toDto(),
      crypto.getRandomValues(new Uint8Array(32)),
      await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode('new custom data')).digest(),
      textEncoder.encode('sending via address derived from reference'),
      token.nametagTokens,
    );

    // Submit the transaction
    const commitment = await client.submitTransaction(
      transactionData,
      await SigningService.createFromSecret(textEncoder.encode('token-secret'), mintTokenData.nonce),
    );

    const transaction = await client.createTransaction(
      commitment, 
      await waitInclusionProof(client, commitment),
    );

    // Finish the transaction
    token = await client.finishTransaction(
      token,
      await TokenState.create(recipientPredicate, textEncoder.encode('new custom data')),
      transaction,
    );

    console.log(token.toString());
    
    // Verify that UnmaskedPredicate reference doesn't depend on tokenId
    const tokenId1 = TokenId.create(crypto.getRandomValues(new Uint8Array(32)));
    const tokenId2 = TokenId.create(crypto.getRandomValues(new Uint8Array(32)));
    const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(32)));
    
    const signingService = await SigningService.createFromSecret(textEncoder.encode('test-predicate-reference'));
    const unmaskSalt = crypto.getRandomValues(new Uint8Array(32));
    
    // Create two predicates with different tokenIds
    const unmaskedPredicate1 = await UnmaskedPredicate.create(
      tokenId1,
      tokenType,
      signingService,
      HashAlgorithm.SHA256,
      unmaskSalt,
    );
    
    const unmaskedPredicate2 = await UnmaskedPredicate.create(
      tokenId2,
      tokenType,
      signingService,
      HashAlgorithm.SHA256,
      unmaskSalt,
    );
    
    // References should be equal (no tokenId is used)
    expect(unmaskedPredicate1.reference.equals(unmaskedPredicate2.reference)).toBe(true);
    
    // Hashes should be different (tokenId is used)
    expect(unmaskedPredicate1.hash.equals(unmaskedPredicate2.hash)).toBe(false);
    
    // Addresses derived from references should be identical
    const unmaskedAddr1 = await DirectAddress.create(unmaskedPredicate1.reference.imprint);
    const unmaskedAddr2 = await DirectAddress.create(unmaskedPredicate2.reference.imprint);
    expect(unmaskedAddr1.toDto()).toBe(unmaskedAddr2.toDto());
    
    // Test the same for MaskedPredicate
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const maskedPredicate1 = await MaskedPredicate.create(
      tokenId1,
      tokenType,
      signingService,
      HashAlgorithm.SHA256,
      nonce
    );
    
    const maskedPredicate2 = await MaskedPredicate.create(
      tokenId2,
      tokenType,
      signingService,
      HashAlgorithm.SHA256,
      nonce
    );
    
    // References should be equal (no tokenId is used)
    expect(maskedPredicate1.reference.equals(maskedPredicate2.reference)).toBe(true);
    
    // Hashes should be different (tokenId is used)
    expect(maskedPredicate1.hash.equals(maskedPredicate2.hash)).toBe(false);
    
    // Addresses derived from references should be identical
    const maskedAddr1 = await DirectAddress.create(maskedPredicate1.reference.imprint);
    const maskedAddr2 = await DirectAddress.create(maskedPredicate2.reference.imprint);
    expect(maskedAddr1.toDto()).toBe(maskedAddr2.toDto());
  }, 15000);
});

class TestTokenData implements ISerializable {
  public constructor(private readonly _data: Uint8Array) {
    this._data = new Uint8Array(_data);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public static decode(data: Uint8Array): Promise<TestTokenData> {
    return Promise.resolve(new TestTokenData(data));
  }

  public encode(): Uint8Array {
    return this.data;
  }

  public toString(): string {
    return dedent`
      TestTokenData: ${HexConverter.encode(this.data)}`;
  }
}
