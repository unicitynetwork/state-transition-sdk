import { TestAggregatorClient } from './TestAggregatorClient.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { Token } from '../../src/transaction/Token.js';
import { TokenVerifier } from '../../src/transaction/verification/default/TokenVerifier.js';
import { IVerificationContext } from '../../src/transaction/verification/IVerificationContext.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../src/transaction/verification/VerificationContext.js';
import { IWorker } from '../../src/transaction/verification/worker/IWorker.js';
import {
  verifyTransferTransactions,
  ITransferTransactionVerificationRequest,
  TransferTransactionVerificationResponse,
  WorkerTokenVerifier,
} from '../../src/transaction/verification/worker/WorkerTokenVerifier.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';
import { mintToken, transferToken } from '../utils/TokenUtils.js';

type Responder = (request: ITransferTransactionVerificationRequest) => Promise<TransferTransactionVerificationResponse>;

/**
 * A fake {@link IWorker} that runs a responder inline instead of in a real thread. A
 * resolved responder is delivered through onmessage like a worker reply; a rejected one is
 * delivered through onerror like a worker crash.
 */
class FakeWorker implements IWorker {
  public onerror: ((event: { message: string }) => void) | null = null;
  public onmessage: ((event: { data: TransferTransactionVerificationResponse }) => void) | null = null;

  public constructor(
    private readonly respond: Responder,
    private readonly onTerminate: () => void,
  ) {}

  public postMessage(request: ITransferTransactionVerificationRequest): void {
    void this.respond(request).then(
      (response) => this.onmessage?.({ data: response }),
      (error: Error) => this.onerror?.({ message: error.message }),
    );
  }

  public terminate(): void {
    this.onTerminate();
  }
}

/**
 * Verifier whose workers are {@link FakeWorker}s. The default responder is the real worker
 * body ({@link verifyTransferTransactions}), exercising the full path — trust base
 * toJSON → fromJSON, self-contained transfer decode, inclusion proof verification — with
 * only the literal thread spawn left out. Tests inject other responders to drive the
 * failure paths, and the verifier records batches, created workers and disposals.
 */
class TestWorkerTokenVerifier extends WorkerTokenVerifier {
  public readonly batches: number[][] = [];
  public created = 0;
  public disposed = 0;

  public constructor(
    poolSize: number,
    private readonly respond: Responder = verifyTransferTransactions,
  ) {
    super(poolSize);
  }

  protected createWorker(): IWorker {
    this.created++;
    return new FakeWorker(
      (request) => {
        this.batches.push(request.transfers.map((transfer) => transfer.index));
        return this.respond(request);
      },
      () => this.disposed++,
    );
  }
}

describe('WorkerTokenVerifier', () => {
  const aggregatorClient = TestAggregatorClient.create();
  const client = new StateTransitionClient(aggregatorClient);
  const trustBase = aggregatorClient.rootTrustBase;

  const createContext = (): IVerificationContext =>
    new VerificationContext(
      trustBase,
      PredicateVerifierService.create(),
      new MintJustificationVerifierService(),
      new TokenIssuanceVerifierService(false),
    );

  // Mint a token and transfer it twice (alice -> bob -> carol), yielding two transfers.
  const mintWithTwoTransfers = async (context: IVerificationContext): Promise<Token> => {
    const alice = SigningService.generate();
    const bob = SigningService.generate();
    const carol = SigningService.generate();

    const aliceToken = await mintToken(
      client,
      context,
      SignaturePredicate.create(alice.publicKey),
      null,
      trustBase.networkId,
    );
    const bobToken = await transferToken(
      client,
      context,
      aliceToken.toCBOR(),
      SignaturePredicate.create(bob.publicKey),
      alice,
    );

    return transferToken(client, context, bobToken.toCBOR(), SignaturePredicate.create(carol.publicKey), bob);
  };

  // Shared across the tests below; minted once because certification is expensive.
  let context: IVerificationContext;
  let token: Token;

  beforeAll(async () => {
    context = createContext();
    token = await mintWithTwoTransfers(context);
    expect(token.transactions.length).toEqual(2);
  }, 30000);

  it('verifies like the default verifier across pool sizes', async () => {
    const expected = await new TokenVerifier().verify(token, context);
    expect(expected.status).toEqual(VerificationStatus.OK);

    for (const poolSize of [1, 2, 8]) {
      const verifier = new TestWorkerTokenVerifier(poolSize);
      const result = await verifier.verify(token, context);
      expect(result.status).toEqual(VerificationStatus.OK);
      verifier.dispose();
    }
  }, 30000);

  it('splits transfers across the pool and reuses it over verifications', async () => {
    const verifier = new TestWorkerTokenVerifier(2);

    const first = await verifier.verify(token, context);
    const second = await verifier.verify(token, context);
    expect([first.status, second.status]).toEqual([VerificationStatus.OK, VerificationStatus.OK]);

    // Two transfers with a pool of two split into two single-transfer batches each time.
    expect(verifier.batches).toEqual([[0], [1], [0], [1]]);
    expect(verifier.created).toEqual(2);

    verifier.dispose();
    expect(verifier.disposed).toEqual(2);
  }, 30000);

  it('queues concurrent verifications on a shared single-worker pool', async () => {
    const verifier = new TestWorkerTokenVerifier(1);

    const [first, second] = await Promise.all([verifier.verify(token, context), verifier.verify(token, context)]);
    expect([first.status, second.status]).toEqual([VerificationStatus.OK, VerificationStatus.OK]);

    // One worker served both verifications; the second waited in the queue.
    expect(verifier.created).toEqual(1);

    verifier.dispose();
    expect(verifier.disposed).toEqual(1);
  }, 30000);

  it('verifies a freshly minted token with no transfers', async () => {
    const freshContext = createContext();
    const alice = SigningService.generate();
    const freshToken = await mintToken(
      client,
      freshContext,
      SignaturePredicate.create(alice.publicKey),
      null,
      trustBase.networkId,
    );

    expect(freshToken.transactions.length).toEqual(0);
    const verifier = new TestWorkerTokenVerifier(4);
    const result = await verifier.verify(freshToken, freshContext);
    expect(result.status).toEqual(VerificationStatus.OK);
    expect(verifier.created).toEqual(0); // nothing to offload, no worker spawned
  }, 30000);

  it('fails the token on the first failing transfer a worker reports', async () => {
    const verifier = new TestWorkerTokenVerifier(2, (request) =>
      Promise.resolve(
        request.transfers.map(({ index }) => ({
          index,
          message: index === 1 ? 'forced failure' : '',
          status: index === 1 ? VerificationStatus.FAIL : VerificationStatus.OK,
        })),
      ),
    );

    const result = await verifier.verify(token, context);
    expect(result.status).toEqual(VerificationStatus.FAIL);
    expect(result.message).toEqual(`Token[0:${token.id.toString()}] verification failed`);
    expect(result.results[0].message).toEqual('Transfer verification failed');
  }, 30000);

  it('rejects when a worker replies with the error envelope', async () => {
    const verifier = new TestWorkerTokenVerifier(2, () => Promise.resolve({ error: 'boom' }));

    await expect(verifier.verify(token, context)).rejects.toThrow('boom');
  }, 30000);

  it('drops a crashed worker and recovers on the next verification', async () => {
    let crashed = false;
    const verifier = new TestWorkerTokenVerifier(1, (request) => {
      if (!crashed) {
        crashed = true;
        return Promise.reject(new Error('worker crashed'));
      }

      return verifyTransferTransactions(request);
    });

    await expect(verifier.verify(token, context)).rejects.toThrow('worker crashed');
    expect(verifier.disposed).toEqual(1); // the crashed worker was terminated and dropped

    const result = await verifier.verify(token, context);
    expect(result.status).toEqual(VerificationStatus.OK);
    expect(verifier.created).toEqual(2); // pool healed with a fresh worker on demand

    verifier.dispose();
    expect(verifier.disposed).toEqual(2);
  }, 30000);
});
