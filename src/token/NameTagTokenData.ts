import { ISerializable } from '../ISerializable.js';

export class NameTagTokenData implements ISerializable {
  public static decode(): Promise<NameTagTokenData> {
    return Promise.resolve(new NameTagTokenData());
  }

  public toJSON(): string {
    throw new Error('toJSON method is not implemented.');
  }

  public toCBOR(): Uint8Array {
    throw new Error('toCBOR method is not implemented.');
  }
}
