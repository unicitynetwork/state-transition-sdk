import { DataHash } from '../../../../../src/crypto/hash/DataHash.js';
import { DataHasher } from '../../../../../src/crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../../../src/crypto/hash/HashAlgorithm.js';
import { Secp256k1SignatureVerifier } from '../../../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { Signature } from '../../../../../src/crypto/secp256k1/Signature.js';
import { SigningService } from '../../../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../../../src/predicate/builtin/SignaturePredicate.js';
import { SignaturePredicateVerifier } from '../../../../../src/predicate/builtin/verification/SignaturePredicateVerifier.js';
import { EncodedPredicate } from '../../../../../src/predicate/EncodedPredicate.js';
import { CborSerializer } from '../../../../../src/serialization/cbor/CborSerializer.js';
import { VerificationStatus } from '../../../../../src/verification/VerificationStatus.js';

describe('SignaturePredicateVerifier', () => {
  const verifier = new SignaturePredicateVerifier(new Secp256k1SignatureVerifier());
  const signingService = SigningService.generate();
  const encodedPredicate = EncodedPredicate.fromPredicate(SignaturePredicate.fromSigningService(signingService));

  const hash = (data: Uint8Array): Promise<DataHash> => new DataHasher(HashAlgorithm.SHA256).update(data).digest();

  const signUnlock = async (): Promise<{
    signature: Signature;
    sourceStateHash: DataHash;
    transactionHash: DataHash;
  }> => {
    const sourceStateHash = await hash(new Uint8Array([1]));
    const transactionHash = await hash(new Uint8Array([2]));
    const digest = await hash(
      CborSerializer.encodeArray(
        CborSerializer.encodeByteString(sourceStateHash.data),
        CborSerializer.encodeByteString(transactionHash.data),
      ),
    );

    return { signature: await signingService.sign(digest), sourceStateHash, transactionHash };
  };

  it('should accept a valid unlock script', async () => {
    const { sourceStateHash, transactionHash, signature } = await signUnlock();

    const result = await verifier.verify(encodedPredicate, sourceStateHash, transactionHash, signature.encode());

    expect(result.status).toBe(VerificationStatus.OK);
  });

  it('should reject an unlock script whose recovery byte has been tampered with', async () => {
    const { sourceStateHash, transactionHash, signature } = await signUnlock();

    const tampered = new Signature(signature.bytes, signature.recovery ^ 1);

    const result = await verifier.verify(encodedPredicate, sourceStateHash, transactionHash, tampered.encode());

    expect(result.status).toBe(VerificationStatus.FAIL);
  });

  it('should fail (not throw) when the recovery byte makes the signature unrecoverable', async () => {
    const { sourceStateHash, transactionHash, signature } = await signUnlock();

    const tampered = new Signature(signature.bytes, 2);

    const result = await verifier.verify(encodedPredicate, sourceStateHash, transactionHash, tampered.encode());

    expect(result.status).toBe(VerificationStatus.FAIL);
  });
});
