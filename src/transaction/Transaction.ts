import type { IInclusionProofJson } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { IMintTransactionDataJson, MintTransactionData } from './MintTransactionData.js';
import { ITransactionDataJson, TransactionData } from './TransactionData.js';
import { ISerializable } from '../ISerializable.js';

/** JSON representation of a {@link Transaction}. */
export interface ITransactionJson<T extends ITransactionDataJson | IMintTransactionDataJson> {
  readonly data: T;
  readonly inclusionProof: IInclusionProofJson;
}

/**
 * A transaction along with its verified inclusion proof.
 */
export class Transaction<T extends TransactionData | MintTransactionData<ISerializable | null>> {
  /**
   * @param data           Transaction data payload
   * @param inclusionProof Proof of inclusion in the ledger
   */
  public constructor(
    public readonly data: T,
    public readonly inclusionProof: InclusionProof,
  ) {}

  /** Serialize transaction and proof to JSON. */
  public toJSON(): ITransactionJson<ITransactionDataJson | IMintTransactionDataJson> {
    return {
      data: this.data.toJSON(),
      inclusionProof: this.inclusionProof.toJSON(),
    };
  }

  /** Serialize transaction and proof to CBOR. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([this.data.toCBOR(), this.inclusionProof.toCBOR()]);
  }

  /**
   * Verify if the provided data matches the optional data hash.
   * @param data Data to verify against the transaction's data hash
   */
  public async containsData(data: Uint8Array | null): Promise<boolean> {
    if (this.data.dataHash) {
      if (!data) {
        return false;
      }

      const dataHash = await new DataHasher(this.data.dataHash.algorithm).update(data).digest();

      return dataHash.equals(this.data.dataHash);
    }

    return !data;
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
        Transaction:
          ${this.data.toString()}
          ${this.inclusionProof.toString()}`;
  }
}
