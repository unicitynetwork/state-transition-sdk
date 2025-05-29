import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { AddressScheme } from './AddressScheme.js';
import { IAddress } from './IAddress.js';

export class NameTagAddress implements IAddress {
  public constructor(private readonly _data: Uint8Array) {
    this._data = new Uint8Array(_data);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public get scheme(): AddressScheme {
    return AddressScheme.PROXY;
  }

  public toJSON(): string {
    return `${this.scheme}://${HexConverter.encode(this._data)}`;
  }

  public toString(): string {
    return `NameTagAddress[${HexConverter.encode(this._data)}]`;
  }
}
