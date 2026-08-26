import { TestAggregatorClient } from './TestAggregatorClient.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { StateMask } from '../../src/transaction/StateMask.js';
import { TransferTransaction } from '../../src/transaction/TransferTransaction.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../src/transaction/verification/VerificationContext.js';
import { expiredExpiresAt, expiresAt } from '../utils/ExpiresAt.js';
import { mintToken } from '../utils/TokenUtils.js';
import { createUnicityCertificateVerifier } from '../utils/UnicityCertificateVerifierFixture.js';

describe('Certification request timeout', () => {
  const aggregatorClient = TestAggregatorClient.create();
  const client = new StateTransitionClient(aggregatorClient);
  const trustBase = aggregatorClient.rootTrustBase;
  const recipient = SignaturePredicate.create(SigningService.generate().publicKey);
  const context = new VerificationContext(
    trustBase,
    PredicateVerifierService.create(),
    createUnicityCertificateVerifier(),
    new MintJustificationVerifierService(),
    new TokenIssuanceVerifierService(false),
  );

  const submit = async (timeout: bigint): Promise<string> => {
    const transaction = await MintTransaction.create(NetworkId.LOCAL, recipient, { expiresAt: timeout });
    const response = await client.submitCertificationRequest(await CertificationData.fromMintTransaction(transaction));

    return response.status;
  };

  it('accepts a request whose timeout is ahead of the round reference time', async () => {
    await expect(submit(expiresAt())).resolves.toEqual(String(CertificationStatus.SUCCESS));
  });

  it('rejects a request whose timeout the round reference time has already reached', async () => {
    await expect(submit(expiredExpiresAt())).resolves.toEqual(String(CertificationStatus.REQUEST_EXPIRED));
  });

  it('rejects a request whose service-assigned deadline has already lapsed', async () => {
    // A request that omits expiresAt is admitted under a deadline the service
    // derives from consensus time. That branch is the default for every caller
    // in this repo, and it can expire too — a zero-length lifetime is expired
    // the moment it is granted, because the deadline is exclusive.
    const service = TestAggregatorClient.create();
    const scoped = new StateTransitionClient(service);
    service.setRequestTtl(0n);

    const transaction = await MintTransaction.create(NetworkId.LOCAL, recipient, { expiresAt: null });

    await expect(
      scoped
        .submitCertificationRequest(await CertificationData.fromMintTransaction(transaction))
        .then((response) => response.status),
    ).resolves.toEqual(String(CertificationStatus.REQUEST_EXPIRED));
  });

  it('reports that it is not ready before consensus hands it a reference time', async () => {
    const service = TestAggregatorClient.create();
    const scoped = new StateTransitionClient(service);
    service.setReferenceTime(0n);

    const transaction = await MintTransaction.create(NetworkId.LOCAL, recipient, { expiresAt: expiresAt() });

    await expect(
      scoped
        .submitCertificationRequest(await CertificationData.fromMintTransaction(transaction))
        .then((response) => response.status),
    ).resolves.toEqual(String(CertificationStatus.SERVICE_NOT_READY));
  });

  describe('validation', () => {
    // Out-of-range deadlines used to be accepted here and surface much later as
    // a bare CborError from inside the transaction hash, far from the mistake.
    const rejected: ReadonlyArray<[string, bigint]> = [
      ['negative', -1n],
      ['zero, which is expired against every reference time', 0n],
      ['wider than CBOR can carry', 2n ** 70n],
    ];

    it.each(rejected)('rejects a mint deadline that is %s', async (_label, deadline) => {
      await expect(MintTransaction.create(NetworkId.LOCAL, recipient, { expiresAt: deadline })).rejects.toThrow(
        /Request deadline/,
      );
    });

    it.each(rejected)(
      'rejects a transfer deadline that is %s',
      async (_label, deadline) => {
        const token = await mintToken(client, context, recipient, null, trustBase.networkId);

        await expect(
          TransferTransaction.create(token, recipient, StateMask.generate(), { expiresAt: deadline }),
        ).rejects.toThrow(/Request deadline/);
      },
      30000,
    );
  });

  it('binds the timeout into the transaction hash', async () => {
    const first = await MintTransaction.create(NetworkId.LOCAL, recipient, { expiresAt: 1755000000n });
    const second = await MintTransaction.create(NetworkId.LOCAL, recipient, {
      expiresAt: 1755000001n,
      salt: first.salt,
      tokenType: first.tokenType,
    });

    await expect(second.calculateTransactionHash()).resolves.not.toEqual(await first.calculateTransactionHash());
  });

  it('rejects any version other than the current one', async () => {
    const transaction = await MintTransaction.create(NetworkId.LOCAL, recipient, { expiresAt: 1755000000n });

    for (const badVersion of [1, 3]) {
      const mismatched = transaction.toCBOR();
      expect(mismatched[4]).toBe(2);
      mismatched[4] = badVersion;

      // fromCBOR validates before it awaits anything, so this throws rather
      // than returning a rejected promise.
      expect(() => MintTransaction.fromCBOR(mismatched)).toThrow(`Unsupported MintTransaction version: ${badVersion}`);
    }
  });
});
