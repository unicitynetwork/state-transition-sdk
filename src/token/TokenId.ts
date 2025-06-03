import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

/**
 * Globally unique identifier of a token.
 */
export class TokenId {
  /**
   * @param _id Byte representation of the identifier
   */
  public constructor(private readonly _id: Uint8Array) {
    this._id = new Uint8Array(_id);
  }

  /** Factory method to wrap a raw identifier. */
  public static create(id: Uint8Array): TokenId {
    return new TokenId(id);
  }

  public static fromJSON(json: string): TokenId {
    return new TokenId(HexConverter.decode(json));
  }

  /** Encode as a hex string for JSON. */
  public toJSON(): string {
    return HexConverter.encode(this._id);
  }

  /** CBOR serialisation. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeByteString(this._id);
  }

  /** Copy of the underlying bytes. */
  public encode(): Uint8Array {
    return new Uint8Array(this._id);
  }

  /** Convert instance to readable string */
  public toString(): string {
    return `TokenId[${HexConverter.encode(this._id)}]`;
  }
}
