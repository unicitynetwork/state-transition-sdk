import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import { ExampleTransferTransactionVerifierWorker } from './ExampleTransferTransactionVerifierWorker.js';
import { TestAggregatorClient } from './TestAggregatorClient.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
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
import { NodeWorker } from '../../src/transaction/verification/worker/NodeWorker.js';
import {
  ITransferTransactionVerificationRequest,
  TransferTransactionVerificationResponse,
  TransferTransactionVerifier,
  WorkerTokenVerifier,
} from '../../src/transaction/verification/worker/WorkerTokenVerifier.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';
import { mintToken, transferToken } from '../utils/TokenUtils.js';

type Responder = (request: ITransferTransactionVerificationRequest) => Promise<TransferTransactionVerificationResponse>;

const defaultResponder: Responder = (request) => new ExampleTransferTransactionVerifierWorker().verify(request);

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
 * body ({@link ExampleTransferTransactionVerifierWorker}), exercising the full path — trust base
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
    private readonly respond: Responder = defaultResponder,
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

  it('verifies with the context the worker was bootstrapped to create', async () => {
    const predicateVerifier = PredicateVerifierService.create();
    const verifySpy = jest.spyOn(predicateVerifier, 'verify');
    let contexts = 0;

    class CustomTransferTransactionVerifier extends TransferTransactionVerifier {
      private readonly mintJustificationVerifier = new MintJustificationVerifierService();
      private readonly tokenIssuanceVerifier = new TokenIssuanceVerifierService(false);

      protected createContext(batchTrustBase: RootTrustBase): Promise<IVerificationContext> {
        contexts++;
        return Promise.resolve(
          new VerificationContext(
            batchTrustBase,
            predicateVerifier,
            this.mintJustificationVerifier,
            this.tokenIssuanceVerifier,
          ),
        );
      }
    }

    const custom = new CustomTransferTransactionVerifier();
    const verifier = new TestWorkerTokenVerifier(2, (request) => custom.verify(request));

    const result = await verifier.verify(token, context);
    expect(result.status).toEqual(VerificationStatus.OK);
    expect(contexts).toEqual(2); // one context per batch
    expect(verifySpy).toHaveBeenCalledTimes(2); // once per transfer

    verifier.dispose();
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

  it('rejects an empty worker response', async () => {
    const verifier = new TestWorkerTokenVerifier(2, () => Promise.resolve([]));

    await expect(verifier.verify(token, context)).rejects.toThrow(
      'Invalid worker response: missing result for transfer',
    );
  });

  it('rejects a partial worker response', async () => {
    const verifier = new TestWorkerTokenVerifier(1, () =>
      Promise.resolve([{ index: 0, message: '', status: VerificationStatus.OK }]),
    );

    await expect(verifier.verify(token, context)).rejects.toThrow(
      'Invalid worker response: missing result for transfer 1',
    );
  });

  it('rejects a duplicate result for the same transfer', async () => {
    const result = { index: 0, message: '', status: VerificationStatus.OK };
    const verifier = new TestWorkerTokenVerifier(1, () => Promise.resolve([result, result]));

    await expect(verifier.verify(token, context)).rejects.toThrow(
      'Invalid worker response: duplicate result for transfer 0',
    );
  });

  it('rejects a result for a transfer that was not requested', async () => {
    const verifier = new TestWorkerTokenVerifier(1, () =>
      Promise.resolve([{ index: 5, message: '', status: VerificationStatus.OK }]),
    );

    await expect(verifier.verify(token, context)).rejects.toThrow(
      'Invalid worker response: unexpected transfer index 5',
    );
  });

  it('rejects a result with an invalid status', async () => {
    const verifier = new TestWorkerTokenVerifier(1, () =>
      Promise.resolve([
        { index: 0, message: '', status: 'BOGUS' as VerificationStatus },
        { index: 1, message: '', status: VerificationStatus.OK },
      ]),
    );

    await expect(verifier.verify(token, context)).rejects.toThrow(
      'Invalid worker response: invalid status of transfer 0',
    );
  });

  it('rejects when a worker replies with the error envelope', async () => {
    const verifier = new TestWorkerTokenVerifier(2, () => Promise.resolve({ error: 'boom' }));

    await expect(verifier.verify(token, context)).rejects.toThrow('boom');
  }, 30000);

  it('verifies across real worker threads running the TypeScript example entry', async () => {
    // The worker registers the TS loader hooks, then imports the example entry, whose
    // top-level bootstrap() wires it to the parent port.
    const hooks = pathToFileURL(path.join(__dirname, '../utils/TsLoaderHooks.mjs')).href;
    const entry = pathToFileURL(path.join(__dirname, 'ExampleTransferTransactionVerifierWorker.ts')).href;
    const script = `require('node:module').register(${JSON.stringify(hooks)}); import(${JSON.stringify(entry)});`;

    class RealWorkerTokenVerifier extends WorkerTokenVerifier {
      public constructor() {
        super(2);
      }

      protected createWorker(): IWorker {
        return new NodeWorker(new Worker(script, { eval: true }));
      }
    }

    const verifier = new RealWorkerTokenVerifier();
    try {
      const result = await verifier.verify(token, context);
      expect(result.status).toEqual(VerificationStatus.OK);
    } finally {
      verifier.dispose();
    }
  }, 60000);

  it('bootstraps to a no-op on the main thread', () => {
    expect(() => new ExampleTransferTransactionVerifierWorker().bootstrap()).not.toThrow();
  });

  it('adapts a node worker thread to the IWorker shape', async () => {
    const script =
      'const { parentPort } = require("node:worker_threads"); parentPort.on("message", () => parentPort.postMessage([]));';
    const worker = new NodeWorker(new Worker(script, { eval: true }));

    const response = await new Promise((resolve) => {
      worker.onmessage = (event): void => resolve(event.data);
      worker.postMessage({ transfers: [], trustBase: null });
    });
    expect(response).toEqual([]);

    worker.terminate();
  }, 30000);

  it('drops a crashed worker and recovers on the next verification', async () => {
    let crashed = false;
    const verifier = new TestWorkerTokenVerifier(1, (request) => {
      if (!crashed) {
        crashed = true;
        return Promise.reject(new Error('worker crashed'));
      }

      return defaultResponder(request);
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
