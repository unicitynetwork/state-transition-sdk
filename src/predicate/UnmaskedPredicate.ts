import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
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
    const reference = await UnmaskedPredicate.calculateReference(
      tokenId,
      tokenType,
      signingService.algorithm,
      signingService.publicKey,
      hashAlgorithm,
    );

    // TODO: Do we hash salt? Verify signed salt?
    const saltHash = await new DataHasher(HashAlgorithm.SHA256).update(salt).digest();
    const nonce = await signingService.sign(saltHash.imprint);

    const hash = await UnmaskedPredicate.calculateHash(reference, nonce.bytes);

    return new UnmaskedPredicate(
      signingService.publicKey,
      signingService.algorithm,
      hashAlgorithm,
      nonce.bytes,
      reference,
      hash,
    );
  }

  public static async fromJSON(tokenId: TokenId, tokenType: TokenType, data: unknown): Promise<DefaultPredicate> {
    if (!DefaultPredicate.isJSON(data)) {
      throw new Error('Invalid one time address predicate JSON');
    }

    const publicKey = HexConverter.decode(data.publicKey);
    const reference = await UnmaskedPredicate.calculateReference(
      tokenId,
      tokenType,
      data.algorithm,
      publicKey,
      data.hashAlgorithm,
    );

    const nonce = HexConverter.decode(data.nonce);
    const hash = await UnmaskedPredicate.calculateHash(reference, nonce);

    return new UnmaskedPredicate(publicKey, data.algorithm, data.hashAlgorithm, nonce, reference, hash);
  }

  private static calculateReference(
    tokenId: TokenId,
    tokenType: TokenType,
    algorithm: string,
    publicKey: Uint8Array,
    hashAlgorithm: HashAlgorithm,
  ): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborEncoder.encodeArray([
          CborEncoder.encodeTextString(UnmaskedPredicate.TYPE),
          tokenId.toCBOR(),
          tokenType.toCBOR(),
          CborEncoder.encodeTextString(algorithm),
          CborEncoder.encodeTextString(HashAlgorithm[hashAlgorithm]),
          CborEncoder.encodeByteString(publicKey),
        ]),
      )
      .digest();
  }

  private static calculateHash(reference: DataHash, nonce: Uint8Array): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(CborEncoder.encodeArray([reference.toCBOR(), CborEncoder.encodeByteString(nonce)]))
      .digest();
  }
}
