import { mintToken, transferToken } from './TokenUtils.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { UnicityCertificateVerifier } from '../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { Secp256k1SignatureVerifier } from '../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../src/transaction/verification/VerificationContext.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';

export const transitionFlowTest = (client: StateTransitionClient, trustBase: RootTrustBase): void => {
  const ALICE_SIGNING_SERVICE = SigningService.generate();
  const BOB_SIGNING_SERVICE = SigningService.generate();
  const CAROL_SIGNING_SERVICE = SigningService.generate();

  describe('Transition', () => {
    it('default successful flow', async () => {
      const predicateVerifier = PredicateVerifierService.create();
      const verificationContext = new VerificationContext(
        trustBase,
        predicateVerifier,
        new UnicityCertificateVerifier(new Secp256k1SignatureVerifier()),
        new MintJustificationVerifierService(),
        new TokenIssuanceVerifierService(false),
      );

      const targetPredicate = SignaturePredicate.create(ALICE_SIGNING_SERVICE.publicKey);

      const aliceToken = await mintToken(client, verificationContext, targetPredicate, null, trustBase.networkId);

      const bobToken = await transferToken(
        client,
        verificationContext,
        aliceToken.toCBOR(),
        SignaturePredicate.create(BOB_SIGNING_SERVICE.publicKey),
        ALICE_SIGNING_SERVICE,
      );

      const carolToken = await transferToken(
        client,
        verificationContext,
        bobToken.toCBOR(),
        SignaturePredicate.create(CAROL_SIGNING_SERVICE.publicKey),
        BOB_SIGNING_SERVICE,
      );

      await expect(carolToken.verify(verificationContext).then((result) => result.status)).resolves.toEqual(
        VerificationStatus.OK,
      );
    }, 30000);
  });
};
