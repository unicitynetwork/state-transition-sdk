import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

export class CoinId {
  public constructor(private readonly data: Uint8Array) {
    this.data = new Uint8Array(data);
  }

  public static fromDto(data: string): CoinId {
    return new CoinId(HexConverter.decode(data));
  }

  public toJSON(): string {
    return HexConverter.encode(this.data);
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeByteString(this.data);
  }
}
