import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { NodeDataHasher } from '@unicitylabs/commons/lib/hash/NodeDataHasher.js';
import { DataHasherFactory } from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';
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
import { ITokenJson, Token } from '../../src/token/Token.js';
import { TokenFactory } from '../../src/token/TokenFactory.js';
import { TokenId } from '../../src/token/TokenId.js';
import { TokenState } from '../../src/token/TokenState.js';
import { TokenType } from '../../src/token/TokenType.js';
import { Commitment } from '../../src/transaction/Commitment.js';
import { MintTransactionData } from '../../src/transaction/MintTransactionData.js';
import { TransactionData } from '../../src/transaction/TransactionData.js';
import { TestAggregatorClient } from '../TestAggregatorClient.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { HashOptions, Path } from '@unicitylabs/prefix-hash-tree/lib/smt.js';
import { BigintConverter } from '@unicitylabs/commons/lib/util/BigintConverter.js';
import { IPathJson, ISumPathJson } from '@unicitylabs/prefix-hash-tree/lib/index.js';
import { SumPath } from '@unicitylabs/prefix-hash-tree/lib/sumtree.js';

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

async function createMintTokenData(secret: Uint8Array, coinData: TokenCoinData): Promise<IMintTokenData> {
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

async function createMintTokenDataForSplit(tokenId: TokenId, secret: Uint8Array, tokenType: TokenType, coinData: TokenCoinData): Promise<IMintTokenData> {
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

describe('Transition', function () {
  it('should verify the token latest state', async () => {
    const client = new StateTransitionClient(new TestAggregatorClient(new SparseMerkleTree(HashAlgorithm.SHA256)));
    const secret = new TextEncoder().encode('secret');
    const coinData = new TokenCoinData([
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
    ]);
    const mintTokenData = await createMintTokenData(secret, coinData);
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
      await DirectAddress.create(mintTokenData.predicate.reference.imprint),
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
          await DirectAddress.create(tokenData.predicate.reference.imprint),
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


    console.log('******************************************* Split tokens *******************************************');
    console.log(splitTokens);
  }, 15000);

  it('should import token and be able to send it', async () => {
    const client = new StateTransitionClient(new TestAggregatorClient(new SparseMerkleTree(HashAlgorithm.SHA256)));
    const secret = new TextEncoder().encode('tere');

    /*
    442865be053688cf7cd912eca2e5f3f460faf055e1dcc0eadb22054285b8b0a3
     */
    let token = await new TokenFactory(new PredicateFactory()).create(
      JSON.parse(
        ' {"coins":[["28e7010f141594778011bddb83f7aa92a30df2e2bce47c168dabe3158bfdae1e","16"],["217692950607dcbdd542e9bb50c764e0a0258911cf2a31dc76f9689c2c4354fa","11"]],"data":"016d23320dccc978d62e2d70887f9b02221f618f6f1718adff0f17ea307990b6","id":"ee72989f43181ba6a492edff79dbb734acc51e0ccd9c431ec5a62ea656aa762b","nametagTokens":[],"state":{"data":"6d7920637573746f6d2064617461","unlockPredicate":{"algorithm":"secp256k1","hashAlgorithm":0,"nonce":"b6e6dec436c651aaf48aa0e88c3c10d73485137c83ff45bed2897df294f1b6c6","publicKey":"02b8c4c0381f07fe7fc34733537d670941110cf7d3fe4038d9dcb99c586894a55b","type":"MASKED"}},"transactions":[{"data":{"dataHash":"0000b3bba4c7727ee8a5e6427b4dcaa3b5464b623b25d06853376d1f3a71f68fd086","reason":null,"recipient":"DIRECT://0000665b8304f5f05943aa4071f9bd8c0d88779759d575f29c89f8fee9d9382f042c01825bda","salt":"745ea70b0a2e56a83cd5c627b5c88e4f0bac69c09b60a3763d67505bd9c4dde2"},"inclusionProof":{"authenticator":{"algorithm":"secp256k1","publicKey":"02035fa666055bece1e9e9a5d5b676627eb541deb84f9c797f76cf49fe3b222fcb","signature":"5896741ac6fee735af6cd7acba2672c55058eca43f2c37a08db8f6dc7472a71431d135ed431030c4f0bf60a52dea84b35dff2daba918d9505b193f733fcf674e00","stateHash":"0000d7d8ed11dd95600be5c9236f1d692fa3016c604610d944080bf099d7887db71a"},"merkleTreePath":{"root":"00009c148ebe318d50e46f276f6baadde5197c422eefaa8f12fda1d213d0d83e9ba1","steps":[{"path":"7588566323972338727352142220657036935442690831691448580224876125533168288187854824","value":"0000b640b44c0e5923fc0b2ddc5508f033faf745f9fc36c0a9cb297213d8df072ab1"}]},"transactionHash":"00008a2843b917108378c2ba57b2b46497bb6c7fcfb920ecd4a5918cfc1fa018abad"}},{"data":{"dataHash":"0000371dd350eb385a9eb4ccf52c532b9f2fb5b24834ea634f4c27739b604cb08102","message":"6d79206d657373616765","nameTags":[],"recipient":"DIRECT://0000a0d9a5ce3d4e2b2e25ba6c4379f99de2193f55bb8915b344b2cd8e1df9763f5b3cb32b01","salt":"67fb6f8ae9bf5e4849e48ccd7068be7d3f8956636905e16d5533af186a46d604","sourceState":{"data":"8e43e461977da2ef6d4c96ae73a4207fc298e67220b816edec7906b559bd6d43","unlockPredicate":{"algorithm":"secp256k1","hashAlgorithm":0,"nonce":"952aba7c22c6d5b8ee6a4405cc9a049c34306bd88f4e9d1cb5a8e7b19360bf41","publicKey":"03e6384ebe50c1618e3b889bdb6bd22b77d5ad7313c4450f026c75487b07d3893d","type":"MASKED"}}},"inclusionProof":{"authenticator":{"algorithm":"secp256k1","publicKey":"03e6384ebe50c1618e3b889bdb6bd22b77d5ad7313c4450f026c75487b07d3893d","signature":"ec95474d162e73439d08ca127e2c117bea3a71060e47c4ce8186a21809d352e330da72be9241fceb416956251465b5d2039a7af8adecd9b26b8db6034ad50abe00","stateHash":"0000840d71bc06b99b5e472499a31b0ade0abd8ead0b901991115362c77e2478ecb3"},"merkleTreePath":{"root":"000024b02c391d1a9734b5e9a67a06c21c70dcec6de953786a11b6af0f5b408517cc","steps":[{"path":"3794275196256977940401344084028398808277948143862373184273475214336114275678115023","sibling":"00001b3dc461114fef952e1fce54df1273ed1328a03a201dba0c265940d5a839aff1","value":"0000ef7bd705eef54eeafe836a081d4d362331ac3a9834d181d6fda3fa91e3ae52eb"},{"path":"2"}]},"transactionHash":"0000234a90fa1de514feb3592f539fb10a19fcfc6c9293661ea96395fa2d97b39552"}}],"type":"e6914ea8fe8fa9c5f3b77810e4d1002b7c6bacb28c6f5cb6b1c8bd04e9bef5f1","version":"2.0"}',
      ),
      TestTokenData.fromJSON,
    );

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const recipientPredicate = await UnmaskedPredicate.create(
      token.id,
      token.type,
      await SigningService.createFromSecret(textEncoder.encode('nextuser')),
      HashAlgorithm.SHA256,
      salt,
    );
    const recipient = await DirectAddress.create(recipientPredicate.reference.imprint);

    const transactionData = await TransactionData.create(
      token.state,
      recipient.toJSON(),
      crypto.getRandomValues(new Uint8Array(32)),
      await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode('new custom data')).digest(),
      textEncoder.encode('sending via public address'),
      token.nametagTokens,
    );

    const tokenPredicate = token.state.unlockPredicate as MaskedPredicate;
    const commitment = await client.submitTransaction(
      transactionData,
      await SigningService.createFromSecret(secret, tokenPredicate.nonce),
    );

    const transaction = await client.createTransaction(commitment, await client.getInclusionProof(commitment));

    token = await client.finishTransaction(
      token,
      await TokenState.create(recipientPredicate, textEncoder.encode('new custom data')),
      transaction,
    );

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

export interface ISplitProofJson {
  burnedToken: ITokenJson;
  burnProofsByCoinId: Array<[string, [IPathJson, ISumPathJson]]>;
}

export class SplitProof<TD extends ISerializable, MTD extends MintTransactionData<ISerializable | null>> implements ISerializable {
  constructor(public readonly burnedToken: Token<TD, MTD>, public readonly burnProofsByCoinId: Map<string, [Path, SumPath]>) {
  }

  public toCBOR(): Uint8Array {
    const encodedBurnProofEntries: Uint8Array[] = [];

    for (const [coinId, proofs] of this.burnProofsByCoinId.entries()) {
      const encodedEntry: Uint8Array = CborEncoder.encodeArray([
        CborEncoder.encodeTextString(coinId),
        CborEncoder.encodeArray([
          proofs[0].toCBOR(),
          proofs[1].toCBOR()
        ])
      ]);
      encodedBurnProofEntries.push(encodedEntry);
    }

    return CborEncoder.encodeArray([
      this.burnedToken.toCBOR(),
      CborEncoder.encodeArray(encodedBurnProofEntries)
    ]);
  }

  public toJSON(): ISplitProofJson {
    const burnProofsArray: Array<[string, [IPathJson, ISumPathJson]]> = [];
    for (const [coinId, proofs] of this.burnProofsByCoinId.entries()) {
      burnProofsArray.push([
        coinId,
        [
          proofs[0].toJSON(),
          proofs[1].toJSON()
        ]
      ]);
    }

    return {
      burnedToken: this.burnedToken.toJSON(),
      burnProofsByCoinId: burnProofsArray,
    };
  }

  public static fromJSON<TD extends ISerializable, MTD extends MintTransactionData<ISerializable | null>>(
    json: ISplitProofJson, // Expects burnProofsByCoinId to be an array
    hashOptions: HashOptions,
    tokenDeserializer: (tokenJson: any) => Token<TD, MTD>
  ): SplitProof<TD, MTD> {
    if (typeof json !== 'object' || json === null) {
      throw new Error('Invalid JSON data for SplitProof: input is not an object.');
    }
    if (typeof json.burnedToken === 'undefined') {
      throw new Error('Invalid JSON data for SplitProof: missing burnedToken.');
    }
    if (!Array.isArray(json.burnProofsByCoinId)) { // Check if it's an array
      throw new Error('Invalid JSON data for SplitProof: burnProofsByCoinId is not an array.');
    }

    const deserializedToken = tokenDeserializer(json.burnedToken);

    const deserializedBurnProofs = new Map<string, [Path, SumPath]>();
    for (const entry of json.burnProofsByCoinId) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
        throw new Error('Invalid JSON data for SplitProof: malformed entry in burnProofsByCoinId array.');
      }
      const coinId = entry[0];
      const proofPairJson = entry[1];

      if (!Array.isArray(proofPairJson) || proofPairJson.length !== 2) {
        throw new Error(`Invalid JSON data for SplitProof: proof pair for coinId ${coinId} is not a 2-element array.`);
      }
      const path = Path.fromJSON(proofPairJson[0], hashOptions);
      const sumPath = SumPath.fromJSON(proofPairJson[1], hashOptions);
      deserializedBurnProofs.set(coinId, [path, sumPath]); // Order of insertion into Map is preserved
    }

    return new SplitProof<TD, MTD>(deserializedToken, deserializedBurnProofs);
  }

  public toString(): string {
    return this.burnedToken.toString();
  }
}

export async function sha256(value: Uint8Array): Promise<Uint8Array<ArrayBufferLike>> {
  return (await new NodeDataHasher(HashAlgorithm.SHA256).update(value).digest()).data;
}
