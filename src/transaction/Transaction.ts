import type { IInclusionProofJson } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { IMintTransactionDataJson, MintTransactionData } from './MintTransactionData.js';
import { ITransactionDataJson, TransactionData } from './TransactionData.js';
import { ISerializable } from '../ISerializable.js';
import { IPredicateFactory } from '../predicate/IPredicateFactory.js';
import { TokenCoinData } from '../token/fungible/TokenCoinData.js';
import { TokenId } from '../token/TokenId.js';
import { TokenState } from '../token/TokenState.js';
import { TokenType } from '../token/TokenType.js';

/** JSON representation of a {@link Transaction}. */
export interface ITransactionJson<T extends ITransactionDataJson | IMintTransactionDataJson> {
  readonly data: T;
  readonly inclusionProof: IInclusionProofJson;
}

/**
 * A transaction along with its verified inclusion proof.
 */
export class Transaction<T extends TransactionData | MintTransactionData<ISerializable | null>> {
  /**
   * @param data           Transaction data payload
   * @param inclusionProof Proof of inclusion in the ledger
   */
  public constructor(
    public readonly data: T,
    public readonly inclusionProof: InclusionProof,
  ) {}

  /**
   * Create a transaction from JSON data.
   * @param tokenId Token identifier
   * @param tokenType Token type
   * @param data Transaction data to deserialize
   * @param inclusionProof Transaction inclusion proof
   * @private
   */
  public static async fromJSON(
    tokenId: TokenId,
    tokenType: TokenType,
    { data, inclusionProof }: ITransactionJson<ITransactionDataJson>,
    predicateFactory: IPredicateFactory,
  ): Promise<Transaction<TransactionData>> {
    return new Transaction(
      await TransactionData.create(
        await TokenState.create(
          await predicateFactory.create(tokenId, tokenType, data.sourceState.unlockPredicate),
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

  public static async fromMintJSON(
    tokenId: TokenId,
    tokenType: TokenType,
    tokenData: ISerializable,
    coinData: TokenCoinData | null,
    sourceState: RequestId,
    transaction: ITransactionJson<IMintTransactionDataJson>,
  ): Promise<Transaction<MintTransactionData<ISerializable | null>>> {
    // TODO: Parse reason properly
    const reason = transaction.data.reason ? null : null;

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
        reason,
      ),
      InclusionProof.fromJSON(transaction.inclusionProof),
    );
  }

  /** Serialize transaction and proof to JSON. */
  public toJSON(): ITransactionJson<ITransactionDataJson | IMintTransactionDataJson> {
    return {
      data: this.data.toJSON(),
      inclusionProof: this.inclusionProof.toJSON(),
    };
  }

  /** Serialize transaction and proof to CBOR. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([this.data.toCBOR(), this.inclusionProof.toCBOR()]);
  }

  /**
   * Verify if the provided data matches the optional data hash.
   * @param data Data to verify against the transaction's data hash
   */
  public async containsData(data: Uint8Array | null): Promise<boolean> {
    if (this.data.dataHash) {
      if (!data) {
        return false;
      }

      const dataHash = await new DataHasher(this.data.dataHash.algorithm).update(data).digest();

      return dataHash.equals(this.data.dataHash);
    }

    return !data;
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
        Transaction:
          ${this.data.toString()}
          ${this.inclusionProof.toString()}`;
  }
}
