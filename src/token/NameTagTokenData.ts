import { ISerializable } from '../ISerializable.js';

/**
 * Placeholder data type for name tag tokens.
 */
export class NameTagTokenData implements ISerializable {
  /**
   * Decode a name tag payload. Currently returns an empty instance.
   */
  public static decode(): Promise<NameTagTokenData> {
    return Promise.resolve(new NameTagTokenData());
  }

  /** @throws Always throws - not implemented. */
  public toJSON(): string {
    throw new Error('toJSON method is not implemented.');
  }

  /** @throws Always throws - not implemented. */
  public toCBOR(): Uint8Array {
    throw new Error('toCBOR method is not implemented.');
  }
}
