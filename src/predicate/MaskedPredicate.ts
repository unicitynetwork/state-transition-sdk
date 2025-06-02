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

const TYPE = PredicateType.MASKED;

/**
 * Predicate where the nonce is hidden (masked) by a hash.
 */
export class MaskedPredicate extends DefaultPredicate {
  /**
   * @param publicKey     Owner public key
   * @param algorithm     Signing algorithm
   * @param hashAlgorithm Algorithm used to generate nonce hash
   * @param nonce         Nonce used in the predicate
   * @param reference     Predicate reference
   * @param hash          Predicate hash
   */
  private constructor(
    publicKey: Uint8Array,
    algorithm: string,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
    reference: DataHash,
    hash: DataHash,
  ) {
    super(TYPE, publicKey, algorithm, hashAlgorithm, nonce, reference, hash);
  }

  /**
   * Create a new masked predicate for the given owner.
   */
  public static async create(
    tokenId: TokenId,
    tokenType: TokenType,
    signingService: ISigningService<ISignature>,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): Promise<MaskedPredicate> {
    const reference = await MaskedPredicate.calculateReference(
      tokenType,
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

  /**
   * Import a predicate from its JSON form.
   */
  public static async fromJSON(tokenId: TokenId, tokenType: TokenType, data: unknown): Promise<MaskedPredicate> {
    if (!DefaultPredicate.isJSON(data)) {
      throw new Error('Invalid one time address predicate json');
    }

    const publicKey = HexConverter.decode(data.publicKey);
    const nonce = HexConverter.decode(data.nonce);
    const reference = await MaskedPredicate.calculateReference(
      tokenType,
      data.algorithm,
      publicKey,
      data.hashAlgorithm,
      nonce,
    );
    const hash = await MaskedPredicate.calculateHash(reference, tokenId);

    return new MaskedPredicate(publicKey, data.algorithm, data.hashAlgorithm, nonce, reference, hash);
  }

  /**
   * Derive the predicate reference for the provided parameters.
   */
  public static calculateReference(
    tokenType: TokenType,
    algorithm: string,
    publicKey: Uint8Array,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborEncoder.encodeArray([
          CborEncoder.encodeTextString(TYPE),
          tokenType.toCBOR(),
          CborEncoder.encodeTextString(algorithm),
          CborEncoder.encodeTextString(HashAlgorithm[hashAlgorithm]),
          CborEncoder.encodeByteString(publicKey),
          CborEncoder.encodeByteString(nonce),
        ]),
      )
      .digest();
  }

  /** Compute the predicate hash for a specific token. */
  private static calculateHash(reference: DataHash, tokenId: TokenId): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(CborEncoder.encodeArray([reference.toCBOR(), tokenId.toCBOR()]))
      .digest();
  }
}
