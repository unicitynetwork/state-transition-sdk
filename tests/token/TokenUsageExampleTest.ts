import { InclusionProof, InclusionProofVerificationStatus } from '@unicitylabs/commons/lib/api/InclusionProof.js';
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
    const coinData = new TokenCoinData([
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
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


    console.log('******************************************* Split tokens *******************************************');
    console.log(splitTokens);
  }, 15000);

  it('should import token and be able to send it', async () => {
    /*
    442865be053688cf7cd912eca2e5f3f460faf055e1dcc0eadb22054285b8b0a3
     */
    const token = await new TokenFactory(new PredicateFactory()).create(
      JSON.parse(
        '{"coins":[["16c9565fdb3a5a3496f04f2c9bf0de09b34f55b2970662a07898fabed317578c","38"],["21ee73434dced941ce83d3dac0c3f9261af74a321d1f8cfeb8d9f8721caa5e73","82"]],"data":"d9ad667e7a347cf14c1502a7ba150c3ccf0d0d4523f67ad526d8ae12902e814e","id":"62dc8146628b9e72828a9566f75b31daad58742618a8c5cc61f2e2be991c83ac","nametagTokens":[],"state":{"data":"6d7920637573746f6d2064617461","unlockPredicate":{"algorithm":"secp256k1","hashAlgorithm":0,"nonce":"b13790687f71346a443f54a6446477c2bc7700ec27eb6bf05a5295a707b5bf3c","publicKey":"02036cf36062511e4bfe7868c06c7611a1d15ba068e25f3518f614585bdae17d07","type":"MASKED"}},"transactions":[{"data":{"dataHash":"0000551aff593ca881abd47ae36c197dc9f394e06ff30e732dcdbdd3ed5ec3d0fe40","reason":null,"recipient":"DIRECT://88,34,0,0,68,167,89,228,116,207,32,101,3,229,157,243,246,183,8,220,102,214,135,36,162,109,72,139,152,236,236,252,100,30,168,103c1e61aa3","salt":"42eb215e685827145ae9e8f0e85acad6f121d1277c87d3386abcf7810dd04d81"},"inclusionProof":{"authenticator":{"algorithm":"secp256k1","publicKey":"02a40e00bb9f120383c34e83108b8f52e40558626311af9c27a2300fe889423a14","signature":"edd1b5ca5a93ad96499683989c09e6f9e8515929d6b2e0ba02e909062e690bf03290cd0290146e38e4aef7981b3a41364baae553980aa79c915a6d73b112375801","stateHash":"0000523980d0ac43090affe60aa5c8d62324e19004016d16766a7871d1ed49d2079b"},"merkleTreePath":{"root":"000038cb9f5b4169eb772777609817f231c44e1dfcf9f7a1db078ccb7ae7aacaae35","steps":[{"branch":["0000c91debe04166f5aae03d4580b31d2a03956a90e9716e33b70290ef5293f2e2ad"],"path":"7588649149295761100161440130452085754533110058562091409936174197616260138218570176","sibling":null}]},"transactionHash":"00001f3dfd815d76580ecdd64e0aeed062bbf6e4a5cbab99c57231d871a0c7e56cd8"}},{"data":{"dataHash":"0000371dd350eb385a9eb4ccf52c532b9f2fb5b24834ea634f4c27739b604cb08102","message":"6d79206d657373616765","nameTags":[],"recipient":"DIRECT://88,34,0,0,255,136,17,146,129,74,57,225,31,50,166,242,99,27,77,73,75,35,163,176,89,245,9,253,188,114,219,159,158,220,233,21bd9a3f67","salt":"669d4f7b0d83de53a8d7e47df4d55eaa497140dd9b22b1bfb05ffa74d7e6b807","sourceState":{"data":"1fa2b7207533884b07ca73f543fe84ff43b9286592616ad1d477b95677583ad4","unlockPredicate":{"algorithm":"secp256k1","hashAlgorithm":0,"nonce":"79d6d660cb0845fe7b2a8508ef9fb992c613b6e3e0d525ba192246ccefd081c1","publicKey":"03087b8dca5315324d737f03f0aafb64e88b3ebd35cba407fb76ef298d31dae3e5","type":"MASKED"}}},"inclusionProof":{"authenticator":{"algorithm":"secp256k1","publicKey":"03087b8dca5315324d737f03f0aafb64e88b3ebd35cba407fb76ef298d31dae3e5","signature":"71772878f316949152beafd099d83ae4ca73ed24359773c2c939ea4a184284aa739e9581d2d8d9ce618bc8d11be5fa7c03f58c801d8f2c500f8545fc4f66bf5301","stateHash":"00004af7ba6d6ff536176b944dbdda79d03dd062a972d76af3a3e17efe624ad9bfe2"},"merkleTreePath":{"root":"0000b84481027c50da30cb7491aaa7b9af8bbaf212fa98ad3e68ab2fdee847e398b9","steps":[{"branch":["0000263a450c27a110e1bf8456c78e2450ab6f630479eefabe0c3769686ee6422e65"],"path":"3794275205504007869408312821825704795923678604410441406998183603722408454352248239","sibling":"00000d8cc593d0cbda705dd65e01361fa880ff018a7133154047c1b48b48edc66e82"},{"branch":[],"path":"2","sibling":null}]},"transactionHash":"0000e4e9d983dd591341a8ba86e27809ba12091265d2af2ccbbcf2783a3997b682b3"}}],"type":"041cedab337d8432e848925ec6a6993915a63d9102093c2c0d5b82fe7efc6492","version":"2.0"}',
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
