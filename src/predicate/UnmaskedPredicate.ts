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

export class UnmaskedPredicate extends DefaultPredicate {
  private static readonly TYPE = PredicateType.UNMASKED;

  private constructor(
    publicKey: Uint8Array,
    algorithm: string,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
    reference: DataHash,
    hash: DataHash,
  ) {
    super(UnmaskedPredicate.TYPE, publicKey, algorithm, hashAlgorithm, nonce, reference, hash);
  }

  public static async create(
    tokenId: TokenId,
    tokenType: TokenType,
    signingService: ISigningService<ISignature>,
    hashAlgorithm: HashAlgorithm,
    salt: Uint8Array,
  ): Promise<DefaultPredicate> {
    // Calculate reference without using tokenId
    const baseReference = await UnmaskedPredicate.calculateReference(
      signingService.algorithm,
      signingService.publicKey,
      hashAlgorithm,
    );

    // TODO: Do we hash salt? Verify signed salt?
    const saltHash = await new DataHasher(HashAlgorithm.SHA256).update(salt).digest();
    const nonce = await signingService.sign(saltHash.imprint);

    // Calculate the final reference (no tokenId included)
    const reference = baseReference;

    // Calculate hash with tokenId
    const hash = await UnmaskedPredicate.calculateHash(reference, tokenId, nonce.bytes);

    return new UnmaskedPredicate(
      signingService.publicKey,
      signingService.algorithm,
      hashAlgorithm,
      nonce.bytes,
      reference,
      hash,
    );
  }

  public static async fromDto(tokenId: TokenId, tokenType: TokenType, data: unknown): Promise<DefaultPredicate> {
    if (!DefaultPredicate.isDto(data)) {
      throw new Error('Invalid one time address predicate dto');
    }

    const publicKey = HexConverter.decode(data.publicKey);
    // Calculate reference without using tokenId
    const reference = await UnmaskedPredicate.calculateReference(data.algorithm, publicKey, data.hashAlgorithm);

    const nonce = HexConverter.decode(data.nonce);
    // Calculate hash with tokenId
    const hash = await UnmaskedPredicate.calculateHash(reference, tokenId, nonce);

    return new UnmaskedPredicate(publicKey, data.algorithm, data.hashAlgorithm, nonce, reference, hash);
  }

  private static async calculateReference(
    algorithm: string,
    publicKey: Uint8Array,
    hashAlgorithm: HashAlgorithm,
  ): Promise<DataHash> {
    const algorithmHash = await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode(algorithm)).digest();
    const hashAlgorithmHash = await new DataHasher(HashAlgorithm.SHA256)
      .update(new Uint8Array([hashAlgorithm & 0xff00, hashAlgorithm & 0xff]))
      .digest();

    return new DataHasher(HashAlgorithm.SHA256)
      .update(textEncoder.encode(UnmaskedPredicate.TYPE))
      .update(algorithmHash.imprint)
      .update(hashAlgorithmHash.imprint)
      .update(publicKey)
      .digest();
  }

  private static calculateHash(reference: DataHash, tokenId: TokenId, nonce: Uint8Array): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(reference.imprint)
      .update(tokenId.encode())
      .update(nonce)
      .digest();
  }
}
