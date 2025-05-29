import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { AddressScheme } from './AddressScheme.js';
import { IAddress } from './IAddress.js';

export class DirectAddress implements IAddress {
  private constructor(
    private readonly data: DataHash,
    private readonly checksum: Uint8Array,
  ) {
    this.checksum = new Uint8Array(checksum.slice(0, 4));
  }

  public get scheme(): AddressScheme {
    return AddressScheme.DIRECT;
  }

  public static async create(predicateReference: DataHash): Promise<DirectAddress> {
    const checksum = await new DataHasher(HashAlgorithm.SHA256).update(predicateReference.toCBOR()).digest();
    return new DirectAddress(predicateReference, checksum.data.slice(0, 4));
  }

  public toJSON(): string {
    return this.toString();
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeTextString(this.toString());
  }

  public toString(): string {
    return `${this.scheme}://${this.data.toCBOR()}${HexConverter.encode(this.checksum)}`;
  }
}
