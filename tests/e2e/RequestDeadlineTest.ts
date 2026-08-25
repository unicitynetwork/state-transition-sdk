import { createE2EContext } from './E2EConfig.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { InclusionProof } from '../../src/api/InclusionProof.js';
import { StateId } from '../../src/api/StateId.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { InclusionProofVerificationStatus } from '../../src/transaction/verification/rule/InclusionProofVerificationRule.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { VerificationError } from '../../src/verification/VerificationError.js';
import { expiredExpiresAt, expiresAt } from '../utils/ExpiresAt.js';
import { createUnicityCertificateVerifier } from '../utils/UnicityCertificateVerifierFixture.js';

/**
 * Request-deadline behaviour against a real aggregator.
 *
 * The functional suite covers the same ground against
 * {@link ../functional/TestAggregatorClient.js}, which derives leaf values with
 * the very code under test; only these tests can tell whether the SDK and the
 * service agree. The stack is brought up by scripts/e2e-aggregator.sh.
 */
describe('E2E request deadline', () => {
  const { aggregatorClient, client, trustBase } = createE2EContext();
  const predicateVerifier = PredicateVerifierService.create();
  const unicityCertificateVerifier = createUnicityCertificateVerifier();

  /** Build a mint request for a fresh recipient under the given deadline. */
  const mintTransaction = (deadline: bigint | null): Promise<MintTransaction> =>
    MintTransaction.create(trustBase.networkId, SignaturePredicate.create(SigningService.generate().publicKey), {
      expiresAt: deadline,
    });

  const submit = async (transaction: MintTransaction): Promise<string> => {
    const response = await client.submitCertificationRequest(await CertificationData.fromMintTransaction(transaction));

    return response.status;
  };

  /** Submit a mint and wait for the aggregator to certify it. */
  const certify = async (deadline: bigint | null): Promise<{ proof: InclusionProof; transaction: MintTransaction }> => {
    const transaction = await mintTransaction(deadline);
    expect(await submit(transaction)).toEqual(String(CertificationStatus.SUCCESS));

    return {
      proof: await waitInclusionProof(client, trustBase, predicateVerifier, unicityCertificateVerifier, transaction),
      transaction,
    };
  };

  describe('at submission', () => {
    it('accepts a deadline ahead of the round reference time', async () => {
      await expect(submit(await mintTransaction(expiresAt()))).resolves.toEqual(String(CertificationStatus.SUCCESS));
    }, 30000);

    it('accepts a request that leaves the deadline to the service', async () => {
      await expect(submit(await mintTransaction(null))).resolves.toEqual(String(CertificationStatus.SUCCESS));
    }, 30000);

    it('rejects a deadline that has already passed', async () => {
      await expect(submit(await mintTransaction(expiredExpiresAt()))).resolves.toEqual(
        String(CertificationStatus.REQUEST_EXPIRED),
      );
    }, 30000);

    it('rejects a deadline equal to a reference time already reached, because the deadline is exclusive', async () => {
      // A reference time the service has already certified a leaf under, so it
      // is at or behind the reference time the next round pins.
      const { proof } = await certify(expiresAt());
      const reached = proof.referenceTime;
      expect(reached).not.toBeNull();

      await expect(submit(await mintTransaction(reached))).resolves.toEqual(
        String(CertificationStatus.REQUEST_EXPIRED),
      );
    }, 60000);
  });

  describe('in the certified leaf', () => {
    it('binds a service-assigned deadline without recording it', async () => {
      const { proof, transaction } = await certify(null);

      // The service derives a deadline from consensus time for a request that
      // omits one. That value is service metadata: it is never written to the
      // leaf, so a later verifier sees the same null the requester sent and has
      // nothing to re-check.
      expect(transaction.expiresAt).toBeNull();
      expect(proof.certificationData?.expiresAt ?? null).toBeNull();
      expect(proof.referenceTime).not.toBeNull();
    }, 60000);

    it('serves back the explicit deadline the transaction hash commits to', async () => {
      const deadline = expiresAt();
      const { proof, transaction } = await certify(deadline);

      expect(proof.certificationData?.expiresAt).toEqual(deadline);
      // Admission is what the deadline governs, and it is exclusive: the leaf
      // could only be created in a round strictly before it.
      expect(proof.referenceTime).not.toBeNull();
      expect(proof.referenceTime! < deadline).toBe(true);

      // The whole certified transaction verifies, which re-derives the leaf
      // value from this reference time and checks the SMT path against it.
      const certified = await transaction.toCertifiedTransaction(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        proof,
      );
      expect(certified.expiresAt).toEqual(deadline);
      expect(certified.referenceTime).toEqual(proof.referenceTime);
    }, 60000);

    it('reports a reference time no later than the round that certified it', async () => {
      const { proof, transaction } = await certify(expiresAt());

      // The service sets the round's input record timestamp to the very
      // reference time its leaves are built from, so for the certifying round
      // the two are equal and the bound the verification rule enforces is
      // exact. Verification therefore has to accept this proof.
      expect(proof.referenceTime).toEqual(proof.unicityCertificate.inputRecord.timestamp);
      await expect(
        transaction.toCertifiedTransaction(trustBase, predicateVerifier, unicityCertificateVerifier, proof),
      ).resolves.toBeDefined();

      // And reject the same leaf presented against an earlier round, which is
      // how a service would back-date a leaf to slip a request past its
      // deadline. Consensus signs the round timestamp, so it cannot.
      const backDated = new InclusionProof(
        proof.certificationData,
        proof.referenceTime! + 1n,
        proof.inclusionCertificate,
        proof.unicityCertificate,
      );
      const rejection = await transaction
        .toCertifiedTransaction(trustBase, predicateVerifier, unicityCertificateVerifier, backDated)
        .then(
          () => null,
          (error: VerificationError) => error,
        );
      expect(rejection?.verificationResult.status).toEqual(InclusionProofVerificationStatus.REFERENCE_TIME_AFTER_ROUND);
    }, 60000);

    it('keeps the reference time stable while the certifying round moves on', async () => {
      const { proof, transaction } = await certify(expiresAt());
      const stateId = await StateId.fromTransaction(transaction);
      const certifiedRound = proof.unicityCertificate.inputRecord.roundNumber;
      const certifiedRoundTime = proof.unicityCertificate.inputRecord.timestamp;

      // The tree is append-only and rounds keep being certified, so wait until a
      // re-fetch is genuinely served against a later root whose clock has moved
      // on. Waiting on the timestamp rather than the round number is what makes
      // the assertion below non-trivial: round timestamps are whole seconds and
      // rounds are shorter than that, so a later round can still report the same
      // second.
      const waitUntil = Date.now() + 30000;
      let refetched = (await aggregatorClient.getInclusionProof(stateId)).inclusionProof;
      while (refetched.unicityCertificate.inputRecord.timestamp <= certifiedRoundTime && Date.now() < waitUntil) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        refetched = (await aggregatorClient.getInclusionProof(stateId)).inclusionProof;
      }
      expect(refetched.unicityCertificate.inputRecord.roundNumber).toBeGreaterThan(certifiedRound);
      expect(refetched.unicityCertificate.inputRecord.timestamp).toBeGreaterThan(certifiedRoundTime);

      // The newer root moved the round clock forward, but the leaf's own
      // creation time did not move with it. The SDK depends on exactly this: it
      // pins the reference time when the transaction is first bound to a proof
      // and rejects any later proof that disagrees.
      expect(refetched.referenceTime).toEqual(proof.referenceTime);
      expect(refetched.certificationData?.expiresAt).toEqual(proof.certificationData?.expiresAt);

      await expect(
        transaction.toCertifiedTransaction(trustBase, predicateVerifier, unicityCertificateVerifier, refetched),
      ).resolves.toBeDefined();
    }, 90000);
  });

  describe('for a pending state', () => {
    it('reports a leaf-less proof for a request that was never submitted', async () => {
      const transaction = await mintTransaction(expiresAt());
      const stateId = await StateId.fromTransaction(transaction);

      const { inclusionProof } = await client.getInclusionProof(stateId);

      // Nothing was certified, so the three leaf fields are absent together —
      // the invariant InclusionProof.fromCBOR enforces on decode.
      expect(inclusionProof.certificationData).toBeNull();
      expect(inclusionProof.referenceTime).toBeNull();
      expect(inclusionProof.inclusionCertificate).toBeNull();
    }, 30000);
  });
});
