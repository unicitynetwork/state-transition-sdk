import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

/** Identifier for a fungible coin type. */
export class CoinId {
  /**
   * @param data Raw byte representation
   */
  public constructor(private readonly data: Uint8Array) {
    this.data = new Uint8Array(data);
  }

  /**
   * Creates a new CoinId from raw bytes.
   * @param data Raw byte representation
   */
  public static fromDto(data: string): CoinId {
    return new CoinId(HexConverter.decode(data));
  }

  /** Hex string representation. */
  public toJSON(): string {
    return HexConverter.encode(this.data);
  }

  /** CBOR serialization. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeByteString(this.data);
  }
}
