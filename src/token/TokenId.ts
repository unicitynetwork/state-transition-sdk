import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

export class TokenId {
  public constructor(private readonly _id: Uint8Array) {
    this._id = new Uint8Array(_id);
  }

  public static create(id: Uint8Array): TokenId {
    return new TokenId(id);
  }

  public toJSON(): string {
    return HexConverter.encode(this._id);
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeByteString(this._id);
  }

  public encode(): Uint8Array {
    return new Uint8Array(this._id);
  }

  public toString(): string {
    return `TokenId[${HexConverter.encode(this._id)}]`;
  }
}
