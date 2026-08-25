import { mintToken, transferToken } from './TokenUtils.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../src/transaction/verification/VerificationContext.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';
import { expiresAt } from '../utils/ExpiresAt.js';
import { createUnicityCertificateVerifier } from '../utils/UnicityCertificateVerifierFixture.js';

/**
 * The two ways a request gets a deadline. Both reach the aggregator, and only
 * the explicit one is recorded in the token, so the flow is run under each.
 */
const DEADLINE_MODES: ReadonlyArray<{ deadline: () => bigint | null; name: string }> = [
  { deadline: (): null => null, name: 'a service-assigned deadline' },
  { deadline: expiresAt, name: 'an explicit deadline' },
];

export const transitionFlowTest = (client: StateTransitionClient, trustBase: RootTrustBase): void => {
  const ALICE_SIGNING_SERVICE = SigningService.generate();
  const BOB_SIGNING_SERVICE = SigningService.generate();
  const CAROL_SIGNING_SERVICE = SigningService.generate();

  describe('Transition', () => {
    it.each(DEADLINE_MODES)(
      'default successful flow with $name',
      async ({ deadline: chooseDeadline }) => {
        // Fixed once: the explicit deadline is derived from the wall clock, and
        // every request in the flow has to carry the same value for the
        // assertions below to mean anything.
        const deadline = chooseDeadline();
        const predicateVerifier = PredicateVerifierService.create();
        const verificationContext = new VerificationContext(
          trustBase,
          predicateVerifier,
          createUnicityCertificateVerifier(),
          new MintJustificationVerifierService(),
          new TokenIssuanceVerifierService(false),
        );

        const targetPredicate = SignaturePredicate.create(ALICE_SIGNING_SERVICE.publicKey);

        const aliceToken = await mintToken(
          client,
          verificationContext,
          targetPredicate,
          null,
          trustBase.networkId,
          undefined,
          undefined,
          null,
          deadline,
        );

        const bobToken = await transferToken(
          client,
          verificationContext,
          aliceToken.toCBOR(),
          SignaturePredicate.create(BOB_SIGNING_SERVICE.publicKey),
          ALICE_SIGNING_SERVICE,
          deadline,
        );

        const carolToken = await transferToken(
          client,
          verificationContext,
          bobToken.toCBOR(),
          SignaturePredicate.create(CAROL_SIGNING_SERVICE.publicKey),
          BOB_SIGNING_SERVICE,
          deadline,
        );

        // The deadline the requester chose is part of what the transaction hash
        // commits to, so it has to survive certification and the token round trip.
        expect(carolToken.genesis.expiresAt).toEqual(deadline);
        expect(carolToken.transactions.map((transaction) => transaction.expiresAt)).toEqual([deadline, deadline]);

        await expect(carolToken.verify(verificationContext).then((result) => result.status)).resolves.toEqual(
          VerificationStatus.OK,
        );
      },
      60000,
    );
  });
};
