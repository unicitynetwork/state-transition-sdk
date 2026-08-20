import { createE2EContext } from './E2EConfig.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationResponse } from '../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { InclusionProofResponse } from '../../src/api/InclusionProofResponse.js';
import { IRequestOptions } from '../../src/api/IRequestOptions.js';
import { StateId } from '../../src/api/StateId.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../src/transaction/TokenSalt.js';
import { TokenType } from '../../src/transaction/TokenType.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { requestTimeout } from '../utils/RequestTimeout.js';
import { createUnicityCertificateVerifier } from '../utils/UnicityCertificateVerifierFixture.js';

/** How long a wait may run past its own deadline before it counts as unbounded. */
const UNBOUNDED_AFTER_MS = 20000;

/**
 * Aggregator client that fires the caller's deadline while a real request to
 * the aggregator is still in flight — the window in which the abort used to be
 * lost, leaving the poll loop running for the lifetime of the process.
 */
class DeadlineDuringRequestClient implements IAggregatorClient {
  public constructor(
    private readonly delegate: IAggregatorClient,
    private readonly controller: AbortController,
    private readonly delayMs: number,
  ) {}

  public getInclusionProof(stateId: StateId, options?: IRequestOptions): Promise<InclusionProofResponse> {
    const response = this.delegate.getInclusionProof(stateId, options);
    const abort = (): void => this.controller.abort(new Error('deadline reached'));
    if (this.delayMs === 0) {
      abort();
    } else {
      setTimeout(abort, this.delayMs).unref();
    }

    return response;
  }

  public submitCertificationRequest(certificationData: CertificationData): Promise<CertificationResponse> {
    return this.delegate.submitCertificationRequest(certificationData);
  }
}

describe('E2E waitInclusionProof deadline', () => {
  const { aggregatorClient, trustBase } = createE2EContext();
  const predicateVerifier = PredicateVerifierService.create();
  const unicityCertificateVerifier = createUnicityCertificateVerifier();

  let transaction: MintTransaction;

  beforeAll(async () => {
    // Never submitted, so the aggregator never certifies it and every wait for
    // it can only end at its deadline.
    transaction = await MintTransaction.create(
      trustBase.networkId,
      SignaturePredicate.create(SigningService.generate().publicKey),
      requestTimeout(),
      null,
      TokenType.generate(),
      TokenSalt.generate(),
      null,
    );
  });

  const outcomeOf = async (client: StateTransitionClient, signal: AbortSignal, interval: number): Promise<string> => {
    let guard: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      waitInclusionProof(
        client,
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        transaction,
        signal,
        interval,
      ).then(
        () => 'resolved',
        (err: unknown) => (err instanceof Error ? err.name : String(err)),
      ),
      new Promise<string>((resolve) => {
        guard = setTimeout(() => resolve('unbounded'), UNBOUNDED_AFTER_MS);
      }),
    ]);
    clearTimeout(guard);

    return outcome;
  };

  it.each([0, 1, 5, 20])(
    'should stop polling when the deadline fires %sms into a request',
    async (delayMs) => {
      const controller = new AbortController();
      const client = new StateTransitionClient(new DeadlineDuringRequestClient(aggregatorClient, controller, delayMs));

      await expect(outcomeOf(client, controller.signal, 1000)).resolves.toBe('SleepError');
    },
    30000,
  );

  it('should stop polling when the deadline fires between polls', async () => {
    const { client } = createE2EContext();

    await expect(outcomeOf(client, AbortSignal.timeout(500), 5000)).resolves.toBe('SleepError');
  }, 30000);
});
