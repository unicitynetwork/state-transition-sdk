import { InclusionProof, InclusionProofVerificationStatus } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { DirectAddress } from '../address/DirectAddress.js';
import { ISerializable } from '../ISerializable.js';
import { MINT_SUFFIX, MINTER_SECRET } from '../StateTransitionClient.js';
import { ITokenJson, Token, TOKEN_VERSION } from './Token.js';
import { TokenId } from './TokenId.js';
import { TokenState } from './TokenState.js';
import { TokenType } from './TokenType.js';
import { IPredicateFactory } from '../predicate/IPredicateFactory.js';
import { IMintTransactionDataJson, MintTransactionData } from '../transaction/MintTransactionData.js';
import { ITransactionDto, Transaction } from '../transaction/Transaction.js';
import { ITransactionDataDto, TransactionData } from '../transaction/TransactionData.js';
import { TokenCoinData } from './fungible/TokenCoinData.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { IPathJson, ISumPathJson } from '@unicitylabs/prefix-hash-tree/lib/index.js';
import { Path, HashOptions } from '@unicitylabs/prefix-hash-tree/lib/smt.js';
import { SumPath } from '@unicitylabs/prefix-hash-tree/lib/sumtree.js';
import { DataHasherFactory } from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { NodeDataHasher } from '@unicitylabs/commons/lib/hash/NodeDataHasher.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';
import { BigintConverter } from '@unicitylabs/commons/lib/util/BigintConverter.js';
import { BurnPredicate } from '../predicate/BurnPredicate.js';
import { PredicateType } from '../predicate/PredicateType.js';

export enum MintReasonType {
  TOKEN_SPLIT = 'TOKEN_SPLIT'
}

const hashOptions = { 
  dataHasherFactory: new DataHasherFactory(NodeDataHasher),
  algorithm: HashAlgorithm.SHA256
};

export class TokenFactory {
  public constructor(private readonly predicateFactory: IPredicateFactory) {}

  public async create<TD extends ISerializable>(
    data: ITokenJson,
    createData: (data: unknown) => Promise<TD>,
  ): Promise<Token<TD, MintTransactionData<ISerializable | null>>> {
    const tokenVersion = data.version;
    if (tokenVersion !== TOKEN_VERSION) {
      throw new Error(`Cannot parse token. Version mismatch: ${tokenVersion} !== ${TOKEN_VERSION}`);
    }

    const tokenId = TokenId.create(HexConverter.decode(data.id));
    const tokenType = TokenType.create(HexConverter.decode(data.type));
    const tokenData: TD = await createData(data.data);
    const coinData = data.coins ? TokenCoinData.fromJSON(data.coins) : null;

    const mintTransaction = await this.createMintTransaction(
      tokenId,
      tokenType,
      tokenData,
      coinData,
      await RequestId.createFromImprint(tokenId.encode(), MINT_SUFFIX),
      data.transactions[0],
    );

    const signingService = await SigningService.createFromSecret(MINTER_SECRET, tokenId.encode());

    if (!(await this.verifyMintTransaction(mintTransaction, signingService.publicKey, coinData, tokenId.toJSON()))) {
      throw new Error('Mint transaction verification failed.');
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
      const expectedRecipient = await DirectAddress.create(transaction.data.sourceState.unlockPredicate.reference);
      if (expectedRecipient.toJSON() !== previousTransaction.data.recipient) {
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

    const expectedRecipient = await DirectAddress.create(state.unlockPredicate.reference);
    if (expectedRecipient.toJSON() !== previousTransaction.data.recipient) {
      throw new Error('Recipient address mismatch');
    }

    // TODO: Add nametag tokens
    return new Token(tokenId, tokenType, tokenData, coinData, state, transactions, [], tokenVersion);
  }

  public async createMintTransaction<MTD extends MintTransactionData<ISerializable | null>>(
    tokenId: TokenId,
    tokenType: TokenType,
    tokenData: ISerializable,
    coinData: TokenCoinData | null,
    sourceState: RequestId,
    transaction: ITransactionDto<IMintTransactionDataJson>,
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
        transaction.data.reason ? await this.createMintReason(transaction.data.reason) : null,
      ),
      InclusionProof.fromJSON(transaction.inclusionProof),
    );
  }

  private async createMintReason(data: unknown): Promise<ISerializable> {
    if (typeof data !== 'object' || data == null || !('type' in data)) {
      throw new Error('MintReason: data is not an object');
    }

    switch (data.type as MintReasonType) {
      case MintReasonType.TOKEN_SPLIT:
        const createData = async (data: unknown): Promise<Uint8ArrayTokenData> => new Uint8ArrayTokenData(HexConverter.decode(data as string));
        return await SplitProof.fromJSON(data as ISplitProofJson, this, createData);
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

  private async verifyMintTransaction(
    transaction: Transaction<MintTransactionData<ISerializable | null>>,
    publicKey: Uint8Array,
    coinData: TokenCoinData | null,
    tokenId: string
  ): Promise<boolean> {
    if (!transaction.inclusionProof.authenticator || !transaction.inclusionProof.transactionHash) {
      return false;
    }

    if (
      HexConverter.encode(transaction.inclusionProof.authenticator.publicKey) !== HexConverter.encode(publicKey) ||
      !transaction.inclusionProof.authenticator.stateHash.equals(transaction.data.sourceState.hash)
    ) {
      return false; // input mismatch
    }

    // Verify if transaction data is valid.
    if (!(await transaction.inclusionProof.authenticator.verify(transaction.data.hash))) {
      return false;
    }

    if (transaction.data.reason instanceof SplitProof) {
      if (coinData == null) {
        return false;
      }
      if (transaction.data.reason.burnedToken.state.unlockPredicate.type != PredicateType.BURN) {
        return false; 
      }
      const coinIds: string[] = new Array();
      const splitProof: SplitProof<Uint8ArrayTokenData, MintTransactionData<ISerializable>> = transaction.data.reason;
      for (let [coinId, [path, sumPath]] of splitProof.burnProofsByCoinId) {
        coinIds.push(coinId);
        
        if (!await path.provesInclusionAt(BigintConverter.decode(HexConverter.decode(coinId)))) {
          return false;
        }
        if (!await sumPath.provesInclusionAt(BigintConverter.decode(HexConverter.decode(tokenId)))) {
          return false;
        }
        if (path.getLeafValue() !== HexConverter.encode(sumPath.getRootHash()!)) {
          return false;
        }
        if (coinData.coins.find(([id, _]) => id.toJSON() === coinId)?.[1] !== sumPath.getLeafNumericValue()) {
          return false;
        }

        if (HexConverter.encode(path.getRootHash()!) !==
            HexConverter.encode((transaction.data.reason.burnedToken.state.unlockPredicate as BurnPredicate).burnReason.newTokensTreeHash.data)) {
          return false;
        }
      }

      const mintedCoinIdsAsStrings = coinData.coins.map(([id, _]) => id.toJSON());
      if (!arraysEqual(coinIds, mintedCoinIdsAsStrings)) {
        return false;
      }
    }

    // Verify inclusion proof path.
    const requestId = await RequestId.create(publicKey, transaction.data.sourceState.hash);
    const status = await transaction.inclusionProof.verify(requestId.toBigInt());
    return status === InclusionProofVerificationStatus.OK;
  }
}

// TODO: Is there a more canonical way?
function arraysEqual(arr1: string[], arr2: string[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  // Use every() to check if all elements are equal at each index
  return arr1.every((value, index) => value === arr2[index]);
}

export interface ISplitProofJson {
  type: MintReasonType.TOKEN_SPLIT;
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
      type: MintReasonType.TOKEN_SPLIT,
      burnedToken: this.burnedToken.toJSON(),
      burnProofsByCoinId: burnProofsArray,
    };
  }

  public static async fromJSON<TD extends ISerializable>(
    json: ISplitProofJson,
    tokenFactory: TokenFactory, 
    createData: (data: unknown) => Promise<TD>): Promise<SplitProof<TD, MintTransactionData<ISerializable | null>>>
  {
    if (typeof json !== 'object' || json === null) {
      throw new Error('Invalid JSON data for SplitProof: input is not an object.');
    }
    if (typeof json.burnedToken === 'undefined') {
      throw new Error('Invalid JSON data for SplitProof: missing burnedToken.');
    }
    if (!Array.isArray(json.burnProofsByCoinId)) { // Check if it's an array
      throw new Error('Invalid JSON data for SplitProof: burnProofsByCoinId is not an array.');
    }

    const deserializedToken = await tokenFactory.create(
      json.burnedToken,
      createData);

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

    return new SplitProof<TD, MintTransactionData<ISerializable | null>>(deserializedToken, deserializedBurnProofs);
  }

  public toString(): string {
    return this.burnedToken.toString();
  }
}

export class Uint8ArrayTokenData implements ISerializable {
  public constructor(private readonly _data: Uint8Array) {
    this._data = new Uint8Array(_data);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public static fromJSON(data: unknown): Promise<Uint8ArrayTokenData> {
    if (typeof data !== 'string') {
      throw new Error('Invalid test token data');
    }

    return Promise.resolve(new Uint8ArrayTokenData(HexConverter.decode(data)));
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
