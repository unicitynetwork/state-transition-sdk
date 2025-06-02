import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { ISerializable } from '../ISerializable.js';
import { TokenCoinData } from '../token/fungible/TokenCoinData.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

/** JSON representation of {@link MintTransactionData}. */
export interface IMintTransactionDataJson {
  readonly recipient: string;
  readonly salt: string;
  readonly dataHash: string | null;
  readonly reason: unknown | null;
}

/**
 * Data object describing a token mint operation.
 */
export class MintTransactionData<R extends ISerializable | null> {
  /**
   * @param hash        Hash of the encoded transaction
   * @param sourceState Pseudo input state used for the mint
   * @param recipient   Address of the first owner
   * @param _salt       Random salt used to derive predicates
   * @param dataHash    Optional metadata hash
   * @param reason      Optional reason object
   */
  private constructor(
    public readonly hash: DataHash,
    public readonly sourceState: RequestId,
    public readonly recipient: string,
    private readonly _salt: Uint8Array,
    public readonly dataHash: DataHash | null,
    public readonly reason: R,
  ) {
    this._salt = new Uint8Array(_salt);
  }

  /** Salt used during predicate creation. */
  public get salt(): Uint8Array {
    return new Uint8Array(this._salt);
  }

  /** Hash algorithm of the transaction hash. */
  public get hashAlgorithm(): HashAlgorithm {
    return this.hash.algorithm;
  }

  /**
   * Construct a new mint transaction.
   */
  public static async create<R extends ISerializable | null>(
    tokenId: TokenId,
    tokenType: TokenType,
    tokenData: ISerializable,
    coinData: TokenCoinData | null,
    sourceState: RequestId,
    recipient: string,
    salt: Uint8Array,
    dataHash: DataHash | null,
    reason: R,
  ): Promise<MintTransactionData<R>> {
    const tokenDataHash = await new DataHasher(HashAlgorithm.SHA256).update(tokenData.toCBOR()).digest();
    return new MintTransactionData(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborEncoder.encodeArray([
            tokenId.toCBOR(),
            tokenType.toCBOR(),
            tokenDataHash.toCBOR(),
            dataHash?.toCBOR() ?? CborEncoder.encodeNull(),
            coinData?.toCBOR() ?? CborEncoder.encodeNull(),
            CborEncoder.encodeTextString(recipient),
            CborEncoder.encodeByteString(salt),
            reason?.toCBOR() ?? CborEncoder.encodeNull(),
          ]),
        )
        .digest(),
      sourceState,
      recipient,
      salt,
      dataHash,
      reason,
    );
  }

  /** Convert to JSON representation. */
  public toJSON(): IMintTransactionDataJson {
    return {
      dataHash: this.dataHash?.toJSON() ?? null,
      reason: this.reason?.toJSON() ?? null,
      recipient: this.recipient,
      salt: HexConverter.encode(this.salt),
    };
  }

  /** Serialise this object using CBOR. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      CborEncoder.encodeTextString(this.recipient),
      CborEncoder.encodeByteString(this.salt),
      this.dataHash?.toCBOR() ?? CborEncoder.encodeNull(),
      this.reason?.toCBOR() ?? CborEncoder.encodeNull(),
    ]);
  }

  /** Multiline debug representation. */
  public toString(): string {
    return dedent`
      MintTransactionData:
        Recipient: ${this.recipient}
        Salt: ${HexConverter.encode(this.salt)}
        Data: ${this.dataHash?.toString() ?? null}
        Reason: ${this.reason?.toString() ?? null}
        Hash: ${this.hash.toString()}`;
  }
}
