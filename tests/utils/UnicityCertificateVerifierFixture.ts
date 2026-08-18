import { UnicitySealQuorumSignaturesVerificationRule } from '../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { UnicityCertificateVerifier } from '../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { VerifiedSealCache } from '../../src/api/bft/verification/VerifiedSealCache.js';
import { Secp256k1SignatureVerifier } from '../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';

/** The default production wiring: secp256k1 signatures, seals memoised. */
export function createUnicityCertificateVerifier(): UnicityCertificateVerifier {
  return new UnicityCertificateVerifier(
    new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier(), new VerifiedSealCache(256)),
  );
}
