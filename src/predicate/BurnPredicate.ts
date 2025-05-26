import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { IPredicate } from './IPredicate.js';
import { PredicateType } from './PredicateType.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

interface IPredicateJson {
  readonly type: PredicateType;
  readonly nonce: string;
}

export class BurnPredicate implements IPredicate {
  private static readonly TYPE = PredicateType.BURN;

  public readonly type: PredicateType = BurnPredicate.TYPE;

  private constructor(
    public readonly reference: DataHash,
    public readonly hash: DataHash,
    private readonly _nonce: Uint8Array,
  ) {}

  public get nonce(): Uint8Array {
    return new Uint8Array(this._nonce);
  }

  public static async create(tokenId: TokenId, tokenType: TokenType, nonce: Uint8Array): Promise<BurnPredicate> {
    const reference = await BurnPredicate.calculateReference(tokenType);
    const hash = await BurnPredicate.calculateHash(reference, tokenId, nonce);

    return new BurnPredicate(reference, hash, nonce);
  }

  public static async fromJSON(tokenId: TokenId, tokenType: TokenType, data: unknown): Promise<BurnPredicate> {
    if (!BurnPredicate.isJSON(data)) {
      throw new Error('Invalid burn predicate json');
    }

    const nonce = HexConverter.decode(data.nonce);
    const reference = await BurnPredicate.calculateReference(tokenType);
    const hash = await BurnPredicate.calculateHash(reference, tokenId, nonce);

    return new BurnPredicate(reference, hash, nonce);
  }

  private static isJSON(data: unknown): data is IPredicateJson {
    return typeof data === 'object' && data !== null && 'nonce' in data && typeof data.nonce === 'string';
  }

  private static calculateReference(tokenType: TokenType): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(CborEncoder.encodeArray([CborEncoder.encodeTextString(BurnPredicate.TYPE), tokenType.toCBOR()]))
      .digest();
  }

  private static calculateHash(reference: DataHash, tokenId: TokenId, nonce: Uint8Array): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(CborEncoder.encodeArray([reference.toCBOR(), tokenId.toCBOR(), CborEncoder.encodeByteString(nonce)]))
      .digest();
  }

  public toJSON(): IPredicateJson {
    return {
      nonce: HexConverter.encode(this._nonce),
      type: this.type,
    };
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([CborEncoder.encodeTextString(this.type)]);
  }

  public verify(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public toString(): string {
    return dedent`
          Predicate[${this.type}]:
            Hash: ${this.hash.toString()}`;
  }

  public isOwner(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
