import { ISerializable } from '../ISerializable.js';

export class NameTagTokenData implements ISerializable {
  public static decode(): Promise<NameTagTokenData> {
    return Promise.resolve(new NameTagTokenData());
  }

  public toJSON(): string {
    return '';
  }

  public toCBOR(): Uint8Array {
    return new Uint8Array();
  }
}
