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
  it('should verify the token latest state', async () => {
    const client = new StateTransitionClient(new TestAggregatorClient(new SparseMerkleTree(HashAlgorithm.SHA256)));
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

  it('should import token and be able to send it', async () => {
    /*
    442865be053688cf7cd912eca2e5f3f460faf055e1dcc0eadb22054285b8b0a3
     */
    const token = await new TokenFactory(new PredicateFactory()).create(
      JSON.parse(
        '{"coins":[["99dd31b0c2e5129d62a20233dbf527bb2939213029251f94076da3ac69a51c13","79"],["05e6766fa7d733d0ad008d5f78f65a5de80c9f77a5cf8e0ac2df2bc27b769d37","62"]],"data":"671cdd05e1a021362f5da10c0896b0be65f7cf62f1532ce1c1864290e976d524","id":"557e8eafdee3193df1034fd97a71931bd36d061c95a0087055aa2a11e184428b","nametagTokens":[],"state":{"data":"6d7920637573746f6d2064617461","unlockPredicate":{"algorithm":"secp256k1","hashAlgorithm":0,"nonce":"16489dcc04070fc6089fac7bd6ed328ac9751c3800633383c1f66f5a10085699","publicKey":"02d6b2d40d8cc8e6b416c767207be6c0dd03530c69150d001b67986c4a8a776143","type":"MASKED"}},"transactions":[{"data":{"dataHash":"00007c873fc31dcd84296aa35e7c1f317d3133c68ce0db5d5afc4b9167fca3c8f299","reason":null,"recipient":"DIRECT://88,34,0,0,248,194,133,61,226,204,191,244,241,13,166,222,81,198,102,72,113,106,149,164,245,101,254,183,166,101,235,248,198,255,123,2180f3ec510","salt":"9c2367637a310b1c404b2219a0945f9085e874782e03876269d12de0af42a3ca"},"inclusionProof":{"authenticator":{"algorithm":"secp256k1","publicKey":"034f990a7e1cef4d4d89b05f2aea1b8b5eb8e3a5f043e0b7cdb1481f1ba5bb4fa1","signature":"5d20163406adec601476e14b115595bafbe9aae9fbdb03ebf81e0d770a8e89053f7edebfb8166e78526964d96144ae6659789245aac8bcf16febe9866aa39cf800","stateHash":"000023bdc1838e58f924bc67d68944476fbd94c1f71295d3a5d2f1211f9d6e716dc0"},"merkleTreePath":{"root":"000032f7b723da9276d5ef256458a807502d81598fbae9e57da6a32e612782f89b6c","steps":[{"path":"7588566757054356845826462434160428069377934704733869837825484297339169290756149345","value":"0000bc1969987ec54c3d1263888c03a0bce0a10fd7da66a9cbec2367bdf071daee20"}]},"transactionHash":"000075a63babee02f3cd13be86ac491cde874996278a4f3bc33a159628825eaed696"}},{"data":{"dataHash":"0000371dd350eb385a9eb4ccf52c532b9f2fb5b24834ea634f4c27739b604cb08102","message":"6d79206d657373616765","nameTags":[],"recipient":"DIRECT://88,34,0,0,123,183,252,226,10,160,49,5,88,157,37,147,51,11,17,124,4,190,101,146,63,192,53,48,27,15,86,132,79,168,51,71623456d0","salt":"a8fa6d7e126001f7a2100af721fd03ec55ce5b1e1cfddeda63e2e1887bc56df1","sourceState":{"data":"4489af20bebfa7ccf975af9f0d29700d108f64aca8fe6fea4eb5aa10fec04a24","unlockPredicate":{"algorithm":"secp256k1","hashAlgorithm":0,"nonce":"0c74be21aa52bd9cd16f01d9470796996220f0c88356bd26065ec9b09d4d492f","publicKey":"0229b3edcd237f6cb0dbffa957df4aea618fe8703e8f6edbcc4fb2ed8c76aaa784","type":"MASKED"}}},"inclusionProof":{"authenticator":{"algorithm":"secp256k1","publicKey":"0229b3edcd237f6cb0dbffa957df4aea618fe8703e8f6edbcc4fb2ed8c76aaa784","signature":"8aed19e78bb1576fdbfb2a075139d5c9a3f2feee74a0c45cd4735255b389dc925b44d1711e724e423353af035d7762268d7e01c4979fd10a0c0de0a489e2823600","stateHash":"000002dc74e6108234302cc7f705e9518e0882714b14b5c9e3894cf5c781932fdca0"},"merkleTreePath":{"root":"00002539fb017c199b8883b162f9294ee22da11e4dbe45030b63fb95b96f527f6bf6","steps":[{"path":"7588609821620861404460661268073713761375339282641185691433678499721269006800095522","sibling":"00002900d336225e8a60e512262aa672ef5154c94ee5ef4d299a0416f0046558d9d6","value":"00007098f05366fa4dc58310c18dd404c16173da91f8df26a73a1eb5cfe365644394"}]},"transactionHash":"000010b543e14c690a579b7008b89ce9ce56e27a6feb06ad70faf6d1728abe992747"}}],"type":"543c25686f208125d492173ea34b54925a23339bb4acae14a781bba5a770cc2e","version":"2.0"}',
      ),
      TestTokenData.fromJSON,
    );

    const signingservice = await SigningService.createFromSecret(
      new TextEncoder().encode('tere'),
      token.state.unlockPredicate.nonce,
    );

    expect(token.state.unlockPredicate.isOwner(signingservice.publicKey)).toBeTruthy();

    console.log(token.toString());
  }, 15000);
});

class TestTokenData implements ISerializable {
  public constructor(private readonly _data: Uint8Array) {
    this._data = new Uint8Array(_data);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public static fromJSON(data: unknown): Promise<TestTokenData> {
    if (typeof data !== 'string') {
      throw new Error('Invalid test token data');
    }

    return Promise.resolve(new TestTokenData(HexConverter.decode(data)));
  }

  public toJSON(): string {
    return HexConverter.encode(this._data);
  }

  public toCBOR(): Uint8Array {
    return this.data;
  }

  public toString(): string {
    return dedent`
      TestTokenData: ${HexConverter.encode(this.data)}`;
  }
}
