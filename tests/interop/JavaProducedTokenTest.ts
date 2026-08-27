import { EXPIRES_AT, hasVector, readVector, readVectorText, REFERENCE_TIME } from './InteropFixture.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { Token } from '../../src/transaction/Token.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../src/transaction/verification/VerificationContext.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';
import { createUnicityCertificateVerifier } from '../utils/UnicityCertificateVerifierFixture.js';

const TOKEN = 'java-token-v2.cbor';
const TRUST_BASE = 'java-token-v2.trust-base.json';

/**
 * The consuming half: a token minted and transferred by the Java SDK, decoded and fully verified
 * here.
 *
 * This is the test that catches a container-format divergence. The golden `CertificationData`
 * vectors both SDKs already carry pin the structure sent to the aggregator, and they stayed
 * byte-identical throughout the change that broke tokens — a Java token could not be read by this
 * SDK at all while those vectors still matched. Only carrying a real token across the language
 * boundary exercises `Token`, the certified transactions inside it, and the verification
 * semantics that read them.
 */
describe('Interop with a token produced by the Java SDK', () => {
  const present = hasVector(TOKEN);

  (present ? it : it.skip)(
    'verifies a token produced by the Java SDK',
    async () => {
      const token = await Token.fromCBOR(readVector(TOKEN));
      const context = new VerificationContext(
        RootTrustBase.fromJSON(JSON.parse(readVectorText(TRUST_BASE))),
        PredicateVerifierService.create(),
        createUnicityCertificateVerifier(),
        new MintJustificationVerifierService(),
        new TokenIssuanceVerifierService(false),
      );

      await expect(token.verify(context).then((result) => result.status)).resolves.toEqual(VerificationStatus.OK);

      // The deadline is committed by the transaction hash, so it has to survive the crossing.
      expect(token.genesis.expiresAt).toEqual(EXPIRES_AT);
      expect(token.genesis.referenceTime).toEqual(REFERENCE_TIME);
      expect(token.transactions).toHaveLength(1);
    },
    30000,
  );
});
