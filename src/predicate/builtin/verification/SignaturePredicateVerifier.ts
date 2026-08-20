import { DataHash } from '../../../crypto/hash/DataHash.js';
import { DataHasher } from '../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../crypto/hash/HashAlgorithm.js';
import { ISignatureVerifier } from '../../../crypto/ISignatureVerifier.js';
import { Signature } from '../../../crypto/secp256k1/Signature.js';
import { CborSerializer } from '../../../serialization/cbor/CborSerializer.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { EncodedPredicate } from '../../EncodedPredicate.js';
import { SignaturePredicate } from '../SignaturePredicate.js';
import { IBuiltInPredicateVerifier } from './IBuiltInPredicateVerifier.js';
import { BuiltInPredicateType } from '../BuiltInPredicateType.js';
import { SignaturePredicateUnlockScript } from '../SignaturePredicateUnlockScript.js';

/**
 * Verifier for {@link SignaturePredicate}: recomputes the
 * (sourceStateHash, transactionHash) digest and checks the signature in the
 * unlock script against the predicate's public key.
 */
export class SignaturePredicateVerifier implements IBuiltInPredicateVerifier {
  public readonly type = BuiltInPredicateType.Signature;

  /**
   * @param {ISignatureVerifier<Signature>} signatureVerifier Verifier for unlock-script signatures.
   */
  public constructor(private readonly signatureVerifier: ISignatureVerifier<Signature>) {}

  /**
   * @inheritDoc
   */
  public async verify(
    encodedPredicate: EncodedPredicate,
    _referenceTime: bigint,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScriptBytes: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const predicate = SignaturePredicate.fromPredicate(encodedPredicate);
    const unlockScript = SignaturePredicateUnlockScript.decode(unlockScriptBytes);

    const result = await this.signatureVerifier.verify(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(sourceStateHash.data),
            CborSerializer.encodeByteString(transactionHash.data),
          ),
        )
        .digest(),
      unlockScript.signature,
      predicate.publicKey,
    );

    if (!result) {
      return new VerificationResult(
        'SignaturePredicateVerifier',
        VerificationStatus.FAIL,
        'Signature verification failed.',
      );
    }

    return new VerificationResult('SignaturePredicateVerifier', VerificationStatus.OK);
  }
}
