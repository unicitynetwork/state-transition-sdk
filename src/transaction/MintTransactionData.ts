import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { ISerializable } from '../ISerializable.js';
import { TokenCoinData } from '../token/fungible/TokenCoinData.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

export interface IMintTransactionDataDto {
  readonly recipient: string;
  readonly salt: string;
  readonly dataHash: string | null;
  readonly reason: string | null;
}

const textEncoder = new TextEncoder();

export class MintTransactionData<R extends ISerializable | null> {
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

  public get salt(): Uint8Array {
    return new Uint8Array(this._salt);
  }

  public get hashAlgorithm(): HashAlgorithm {
    return this.hash.algorithm;
  }

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
    const tokenDataHash = await new DataHasher(HashAlgorithm.SHA256).update(tokenData.encode()).digest();
    // TODO: Do not use empty arrays because those will be just skipped
    return new MintTransactionData(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(tokenId.encode())
        .update(tokenType.encode())
        .update(tokenDataHash.imprint)
        .update(dataHash?.imprint ?? new Uint8Array())
        .update(coinData?.encode() ?? new Uint8Array())
        .update(textEncoder.encode(recipient))
        .update(salt)
        .update(reason?.encode() ?? new Uint8Array())
        .digest(),
      sourceState,
      recipient,
      salt,
      dataHash,
      reason,
    );
  }

  public toDto(): IMintTransactionDataDto {
    return {
      dataHash: this.dataHash?.toJSON() ?? null,
      reason: this.reason ? HexConverter.encode(this.reason.encode()) : null,
      recipient: this.recipient,
      salt: HexConverter.encode(this.salt),
    };
  }

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
