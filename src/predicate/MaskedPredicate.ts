import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import type { ISignature } from '@unicitylabs/commons/lib/signing/ISignature.js';
import type { ISigningService } from '@unicitylabs/commons/lib/signing/ISigningService.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { DefaultPredicate } from './DefaultPredicate.js';
import { PredicateType } from './PredicateType.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

const textEncoder = new TextEncoder();

export class MaskedPredicate extends DefaultPredicate {
  private static readonly TYPE = PredicateType.MASKED;

  private constructor(
    publicKey: Uint8Array,
    algorithm: string,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
    reference: DataHash,
    hash: DataHash,
  ) {
    super(MaskedPredicate.TYPE, publicKey, algorithm, hashAlgorithm, nonce, reference, hash);
  }

  public static async create(
    tokenId: TokenId,
    tokenType: TokenType,
    signingService: ISigningService<ISignature>,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): Promise<DefaultPredicate> {
    const reference = await MaskedPredicate.calculateReference(
      signingService.algorithm,
      signingService.publicKey,
      hashAlgorithm,
      nonce,
    );

    const hash = await MaskedPredicate.calculateHash(reference, tokenId);

    return new MaskedPredicate(
      signingService.publicKey,
      signingService.algorithm,
      hashAlgorithm,
      nonce,
      reference,
      hash,
    );
  }

  public static async fromDto(tokenId: TokenId, tokenType: TokenType, data: unknown): Promise<DefaultPredicate> {
    if (!DefaultPredicate.isDto(data)) {
      throw new Error('Invalid one time address predicate dto');
    }

    const publicKey = HexConverter.decode(data.publicKey);
    const nonce = HexConverter.decode(data.nonce);

    const reference = await MaskedPredicate.calculateReference(data.algorithm, publicKey, data.hashAlgorithm, nonce);

    const hash = await MaskedPredicate.calculateHash(reference, tokenId);

    return new MaskedPredicate(publicKey, data.algorithm, data.hashAlgorithm, nonce, reference, hash);
  }

  private static async calculateReference(
    algorithm: string,
    publicKey: Uint8Array,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): Promise<DataHash> {
    const algorithmHash = await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode(algorithm)).digest();
    const hashAlgorithmHash = await new DataHasher(HashAlgorithm.SHA256)
      .update(new Uint8Array([hashAlgorithm & 0xff00, hashAlgorithm & 0xff]))
      .digest();

    return new DataHasher(HashAlgorithm.SHA256)
      .update(textEncoder.encode(MaskedPredicate.TYPE))
      .update(algorithmHash.imprint)
      .update(hashAlgorithmHash.imprint)
      .update(publicKey)
      .update(nonce)
      .digest();
  }

  private static calculateHash(reference: DataHash, tokenId: TokenId): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(reference.imprint).update(tokenId.encode()).digest();
  }
}
