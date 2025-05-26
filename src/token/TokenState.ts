import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { IPredicate, IPredicateJson } from '../predicate/IPredicate.js';

export interface ITokenStateJson {
  readonly unlockPredicate: IPredicateJson;
  readonly data: string | null;
}

export class TokenState {
  private constructor(
    public readonly unlockPredicate: IPredicate,
    private readonly _data: Uint8Array | null,
    public readonly hash: DataHash,
  ) {
    this._data = _data ? new Uint8Array(_data) : null;
  }

  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

  public get hashAlgorithm(): HashAlgorithm {
    return this.hash.algorithm;
  }

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

  public toJSON(): ITokenStateJson {
    return {
      data: this._data ? HexConverter.encode(this._data) : null,
      unlockPredicate: this.unlockPredicate.toJSON(),
    };
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      this.unlockPredicate.toCBOR(),
      CborEncoder.encodeOptional(this._data, CborEncoder.encodeByteString),
    ]);
  }

  public toString(): string {
    return dedent`
        TokenState:
          ${this.unlockPredicate.toString()}
          Data: ${this._data ? HexConverter.encode(this._data) : null}
          Hash: ${this.hash.toString()}`;
  }
}
