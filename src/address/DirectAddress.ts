import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { AddressScheme } from './AddressScheme.js';
import { IAddress } from './IAddress.js';

/**
 * Address that directly references a predicate.
 *
 * This address type is used to point to a specific predicate by its reference hash.
 * It includes a checksum to help detect mistyped addresses.
 */
export class DirectAddress implements IAddress {
  /**
   * Create a new {@link DirectAddress} instance.
   *
   * @param data     Reference to the predicate this address points to
   * @param checksum 4-byte checksum to detect mistyped addresses
   */
  private constructor(
    private readonly data: DataHash,
    private readonly checksum: Uint8Array,
  ) {
    this.checksum = new Uint8Array(checksum.slice(0, 4));
  }

  /**
   * @inheritDoc
   */
  public get scheme(): AddressScheme {
    return AddressScheme.DIRECT;
  }

  /**
   * Build a direct address from a predicate reference.
   *
   * @param predicateReference The predicate reference to encode
   * @returns Newly created address instance
   */
  public static async create(predicateReference: DataHash): Promise<DirectAddress> {
    const checksum = await new DataHasher(HashAlgorithm.SHA256).update(predicateReference.toCBOR()).digest();
    return new DirectAddress(predicateReference, checksum.data.slice(0, 4));
  }

  /**
   * Create new DirectAddress from string.
   * @param data Address as string.
   */
  public static async fromJSON(data: string): Promise<DirectAddress> {
    const [scheme, uri] = data.split('://');
    if (scheme !== AddressScheme.DIRECT) {
      throw new Error(`Invalid address scheme: expected ${AddressScheme.DIRECT}, got ${scheme}`);
    }

    const checksum = uri.slice(-8);
    const address = await DirectAddress.create(DataHash.fromCBOR(HexConverter.decode(uri.slice(0, -8))));
    if (HexConverter.encode(address.checksum) !== checksum) {
      throw new Error(
        `Invalid checksum for DirectAddress: expected ${checksum}, got ${HexConverter.encode(address.checksum)}`,
      );
    }

    return address;
  }

  /**
   * Convert the address into its canonical string form.
   */
  public toJSON(): string {
    return this.toString();
  }

  /**
   * Encode the address as a CBOR text string.
   */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeTextString(this.toString());
  }

  /** Convert instance to readable string */
  public toString(): string {
    return `${this.scheme}://${HexConverter.encode(this.data.toCBOR())}${HexConverter.encode(this.checksum)}`;
  }
}
