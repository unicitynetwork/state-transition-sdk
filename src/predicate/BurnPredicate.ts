import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { IPredicate } from './IPredicate.js';
import { PredicateType } from './PredicateType.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

interface IBurnPredicateDto {
  readonly type: PredicateType;
  readonly msg: string;
}

const textEncoder = new TextEncoder();

export class BurnPredicate implements IPredicate {
  private static readonly TYPE = PredicateType.BURN;

  public readonly type: PredicateType = BurnPredicate.TYPE;
  public readonly hash: DataHash;
  public readonly msg: Uint8Array;

  private constructor(
    public readonly reference: DataHash,
    hash: DataHash,
    msg: Uint8Array,
  ) {
    this.hash = hash;
    this.msg = new Uint8Array(msg);
  }

  public static async create(
    tokenId: TokenId,
    tokenType: TokenType,
    msg: Uint8Array = new Uint8Array(),
  ): Promise<BurnPredicate> {
    const reference = await BurnPredicate.calculateReference(tokenType, msg);
    const hash = await BurnPredicate.calculateHash(reference, tokenId);

    return new BurnPredicate(reference, hash, msg);
  }

  public static async fromDto(tokenId: TokenId, tokenType: TokenType, data: unknown): Promise<BurnPredicate> {
    if (!BurnPredicate.isDto(data)) {
      throw new Error('Invalid burn predicate dto');
    }

    const msg = data.msg ? HexConverter.decode(data.msg) : new Uint8Array();
    const reference = await BurnPredicate.calculateReference(tokenType, msg);
    const hash = await BurnPredicate.calculateHash(reference, tokenId);

    return new BurnPredicate(reference, hash, msg);
  }

  private static isDto(data: unknown): data is IBurnPredicateDto {
    return (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === PredicateType.BURN &&
      (!('msg' in data) || typeof data.msg === 'string')
    );
  }

  public static calculateReference(tokenType: TokenType, msg: Uint8Array): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(textEncoder.encode(BurnPredicate.TYPE))
      .update(tokenType.encode())
      .update(msg)
      .digest();
  }

  private static calculateHash(reference: DataHash, tokenId: TokenId): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(reference.imprint).update(tokenId.encode()).digest();
  }

  public toDto(): IBurnPredicateDto {
    return {
      msg: this.msg.length > 0 ? HexConverter.encode(this.msg) : '',
      type: this.type,
    };
  }

  public verify(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public toString(): string {
    return dedent`
          Predicate[${this.type}]:
            Message: ${this.msg.length > 0 ? HexConverter.encode(this.msg) : '<empty>'}
            Reference: ${this.reference.toString()}
            Hash: ${this.hash.toString()}`;
  }

  public isOwner(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
