import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { AddressScheme } from './AddressScheme.js';
import { IAddress } from './IAddress.js';

/**
 * Address pointing to an off-chain name tag object.
 */
export class NameTagAddress implements IAddress {
  /**
   * Create a new address that references the provided name tag.
   *
   * @param _data Encoded name tag identifier
   */
  public constructor(private readonly _data: Uint8Array) {
    this._data = new Uint8Array(_data);
  }

  /**
   * Raw identifier of the name tag this address points to.
   */
  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  /**
   * {@inheritDoc IAddress.scheme}
   */
  public get scheme(): AddressScheme {
    return AddressScheme.PROXY;
  }

  /**
   * Serialise the address into its URI string representation.
   */
  public toJSON(): string {
    return `${this.scheme}://${HexConverter.encode(this._data)}`;
  }

  /**
   * Returns a human readable representation for debugging.
   */
  public toString(): string {
    return `NameTagAddress[${HexConverter.encode(this._data)}]`;
  }
}
