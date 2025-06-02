import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { IPredicate, IPredicateJson } from '../predicate/IPredicate.js';

/** JSON representation of {@link TokenState}. */
export interface ITokenStateJson {
  readonly unlockPredicate: IPredicateJson;
  readonly data: string | null;
}

/**
 * Represents a snapshot of token ownership and associated data.
 */
export class TokenState {
  /**
   * @param unlockPredicate Predicate controlling future transfers
   * @param _data           Optional encrypted state data
   * @param hash            Hash of predicate and data
   */
  private constructor(
    public readonly unlockPredicate: IPredicate,
    private readonly _data: Uint8Array | null,
    public readonly hash: DataHash,
  ) {
    this._data = _data ? new Uint8Array(_data) : null;
  }

  /** Copy of the stored state data. */
  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

  /** Hash algorithm used for the state hash. */
  public get hashAlgorithm(): HashAlgorithm {
    return this.hash.algorithm;
  }

  /**
   * Compute a new token state from predicate and optional data.
   */
  public static async create(unlockPredicate: IPredicate, data: Uint8Array | null): Promise<TokenState> {
    return new TokenState(
      unlockPredicate,
      data,
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborEncoder.encodeArray([
            unlockPredicate.hash.toCBOR(),
            CborEncoder.encodeOptional(data, CborEncoder.encodeByteString),
          ]),
        )
        .digest(),
    );
  }

  /** Serialise the state to JSON. */
  public toJSON(): ITokenStateJson {
    return {
      data: this._data ? HexConverter.encode(this._data) : null,
      unlockPredicate: this.unlockPredicate.toJSON(),
    };
  }

  /** Encode the state as CBOR. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      this.unlockPredicate.toCBOR(),
      CborEncoder.encodeOptional(this._data, CborEncoder.encodeByteString),
    ]);
  }

  /** Human readable form for debugging. */
  public toString(): string {
    return dedent`
        TokenState:
          ${this.unlockPredicate.toString()}
          Data: ${this._data ? HexConverter.encode(this._data) : null}
          Hash: ${this.hash.toString()}`;
  }
}
