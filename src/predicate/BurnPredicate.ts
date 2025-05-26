import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { IPredicate, IPredicateJson } from './IPredicate.js';
import { PredicateType } from './PredicateType.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

interface IBurnPredicateJson extends IPredicateJson {
  readonly type: PredicateType;
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
  private static readonly TYPE = PredicateType.BURN;

  public readonly type: PredicateType = BurnPredicate.TYPE;
  public readonly hash: DataHash;

  private constructor(public readonly reference: DataHash, public readonly burnReason: BurnReason) {
    this.hash = reference;
  }

  public static async create(tokenId: TokenId, tokenType: TokenType, burnReason: BurnReason): Promise<BurnPredicate> {
    const reference = await BurnPredicate.calculateReference(tokenId, tokenType, burnReason);
    return new BurnPredicate(reference, burnReason);
  }

  public static isJSON(data: unknown): data is IBurnPredicateJson {
    return (
      typeof data === 'object' &&
      data !== null &&

      'type' in data &&
      data.type === PredicateType.BURN &&

      'burnReason' in data &&
      BurnReason.isJSON(data.burnReason)
    );
  }

  public static async fromJSON(tokenId: TokenId, tokenType: TokenType, data: unknown): Promise<BurnPredicate> {
    if (!BurnPredicate.isJSON(data)) {
      throw new Error('Invalid burn predicate JSON');
    }

    const burnReason = BurnReason.fromJSON(data.burnReason);
    const reference = await BurnPredicate.calculateReference(tokenId, tokenType, burnReason);
    return new BurnPredicate(reference, burnReason);
  }

  private static calculateReference(tokenId: TokenId, tokenType: TokenType, burnReason: BurnReason): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborEncoder.encodeArray([
          CborEncoder.encodeTextString(BurnPredicate.TYPE),
          tokenId.toCBOR(),
          tokenType.toCBOR(),
          burnReason.toCBOR()
        ]),
      )
      .digest();
  }

  public toJSON(): IBurnPredicateJson {
    return {
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
