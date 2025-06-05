import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

/** Unique identifier describing the type/category of a token. */
export class TokenType {
  /**
   * @param _id Byte representation of the token type
   */
  public constructor(private readonly _id: Uint8Array) {
    this._id = new Uint8Array(_id);
  }

  /** Create an instance from raw bytes. */
  public static create(id: Uint8Array): TokenType {
    return new TokenType(id);
  }

  /** Raw bytes of the token type. */
  public encode(): Uint8Array {
    return new Uint8Array(this._id);
  }

  /** Hex representation for JSON serialization. */
  public toJSON(): string {
    return HexConverter.encode(this._id);
  }

  /** CBOR serialization. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeByteString(this._id);
  }

  /** Convert instance to readable string */
  public toString(): string {
    return `TokenType[${HexConverter.encode(this._id)}]`;
  }
}
