import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { IPredicate, IPredicateJson } from './IPredicate.js';
import { PredicateType } from './PredicateType.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

const TYPE = PredicateType.BURN;

interface IBurnPredicateJson  {
  readonly type: PredicateType;
  readonly nonce: string;
  readonly burnReason: string;
}

export class BurnReason {
  public constructor(public readonly newTokensTreeHash: DataHash) {
  }

  public static isJSON(data: unknown): data is string {
    return (
      typeof data === 'string'
    );
  }

  public static fromJSON(data: unknown): BurnReason {
    if (!BurnReason.isJSON(data)) {
      throw new Error('Invalid burn reason JSON');
    }
    return new BurnReason(DataHash.fromJSON(data));
  }

  public toJSON(): string {
    return this.newTokensTreeHash.toJSON();
  }

  public encode(): Uint8Array {
    return this.newTokensTreeHash.imprint;
  }

  public toCBOR(): Uint8Array {
    return this.newTokensTreeHash.toCBOR();
  }
}
  
export class BurnPredicate implements IPredicate {
  public readonly type: PredicateType = TYPE;

  private constructor(
    public readonly reference: DataHash,
    public readonly hash: DataHash,
    private readonly _nonce: Uint8Array,
    public readonly burnReason: BurnReason
  ) {}

  public get nonce(): Uint8Array {
    return new Uint8Array(this._nonce);
  }

  public static async create(tokenId: TokenId, tokenType: TokenType, nonce: Uint8Array, burnReason: BurnReason): Promise<BurnPredicate> {
    const reference = await BurnPredicate.calculateReference(tokenId, tokenType, burnReason);
    const hash = await BurnPredicate.calculateHash(reference, tokenId, nonce);

    return new BurnPredicate(reference, hash, nonce, burnReason);
  }

  private static isJSON(data: unknown): data is IBurnPredicateJson {
    return typeof data === 'object' && data !== null && 'nonce' in data && typeof data.nonce === 'string' &&
        'burnReason' in data && BurnReason.isJSON(data.burnReason) && 'type' in data && data.type === TYPE;
  }

  public static async fromJSON(tokenId: TokenId, tokenType: TokenType, data: unknown): Promise<BurnPredicate> {
    if (!BurnPredicate.isJSON(data)) {
      throw new Error('Invalid burn predicate json');
    }

    const nonce = HexConverter.decode(data.nonce);
    const burnReason = BurnReason.fromJSON(data.burnReason);
    const reference = await BurnPredicate.calculateReference(tokenId, tokenType, burnReason);
    const hash = await BurnPredicate.calculateHash(reference, tokenId, nonce);

    return new BurnPredicate(reference, hash, nonce, burnReason);
  }

  private static calculateReference(tokenId: TokenId, tokenType: TokenType, burnReason: BurnReason): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborEncoder.encodeArray([
          CborEncoder.encodeTextString(TYPE),
          tokenId.toCBOR(),
          tokenType.toCBOR(),
          burnReason.toCBOR()
        ]),
      )
      .digest();
  }

  private static calculateHash(reference: DataHash, tokenId: TokenId, nonce: Uint8Array): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(CborEncoder.encodeArray([reference.toCBOR(), tokenId.toCBOR(), CborEncoder.encodeByteString(nonce)]))
      .digest();
  }

  public toJSON(): IBurnPredicateJson {
    return {
      nonce: HexConverter.encode(this._nonce),
      type: this.type,
      burnReason: this.burnReason.toJSON()
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
