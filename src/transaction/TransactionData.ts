import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { NameTagToken } from '../token/NameTagToken.js';
import { ITokenJson } from '../token/Token.js';
import { ITokenStateJson, TokenState } from '../token/TokenState.js';

export interface ITransactionDataDto {
  readonly sourceState: ITokenStateJson;
  readonly recipient: string;
  readonly salt: string;
  readonly dataHash: string | null;
  readonly message: string | null;
  readonly nameTags: ITokenJson[];
}

export class TransactionData {
  private constructor(
    public readonly hash: DataHash,
    public readonly sourceState: TokenState,
    public readonly recipient: string,
    public readonly salt: Uint8Array,
    public readonly dataHash: DataHash | null,
    private readonly _message: Uint8Array | null,
    private readonly nameTags: NameTagToken[] = [],
  ) {
    this._message = _message ? new Uint8Array(_message) : null;
    this.nameTags = Array.from(nameTags);
  }

  public get message(): Uint8Array | null {
    return this._message ? new Uint8Array(this._message) : null;
  }

  public get hashAlgorithm(): HashAlgorithm {
    return this.hash.algorithm;
  }

  public static async create(
    state: TokenState,
    recipient: string,
    salt: Uint8Array,
    dataHash: DataHash | null,
    message: Uint8Array | null,
    nameTags: NameTagToken[] = [],
  ): Promise<TransactionData> {
    return new TransactionData(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborEncoder.encodeArray([
            state.hash.toCBOR(),
            dataHash?.toCBOR() ?? CborEncoder.encodeNull(),
            CborEncoder.encodeTextString(recipient),
            CborEncoder.encodeByteString(salt),
            CborEncoder.encodeOptional(message, CborEncoder.encodeByteString),
          ]),
        )
        .digest(),
      state,
      recipient,
      salt,
      dataHash,
      message,
      nameTags,
    );
  }

  public toJSON(): ITransactionDataDto {
    return {
      dataHash: this.dataHash?.toJSON() ?? null,
      message: this._message ? HexConverter.encode(this._message) : null,
      nameTags: this.nameTags.map((token) => token.toJSON()),
      recipient: this.recipient,
      salt: HexConverter.encode(this.salt),
      sourceState: this.sourceState.toJSON(),
    };
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      this.sourceState.toCBOR(),
      CborEncoder.encodeTextString(this.recipient),
      CborEncoder.encodeByteString(this.salt),
      this.dataHash?.toCBOR() ?? CborEncoder.encodeNull(),
      this._message ? CborEncoder.encodeByteString(this._message) : CborEncoder.encodeNull(),
      CborEncoder.encodeArray(this.nameTags.map((token) => token.toCBOR())),
    ]);
  }

  public toString(): string {
    return dedent`
      TransactionData:
        ${this.sourceState.toString()}
        Recipient: ${this.recipient.toString()}
        Salt: ${HexConverter.encode(this.salt)}
        Data: ${this.dataHash?.toString() ?? null}
        Message: ${this._message ? HexConverter.encode(this._message) : null}
        NameTags: [
          ${this.nameTags.map((token) => token.toString()).join('\n')}
        ]
        Hash: ${this.hash.toString()}`;
  }
}
