import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { Token } from '../../src/transaction/Token.js';
import { IVerificationContext } from '../../src/transaction/verification/IVerificationContext.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../src/transaction/verification/VerificationContext.js';
import { IWorker } from '../../src/transaction/verification/worker/IWorker.js';
import {
  ITransferTransactionVerificationRequest,
  TransferTransactionVerificationResponse,
  WorkerTokenVerifier,
} from '../../src/transaction/verification/worker/WorkerTokenVerifier.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';
import { TestAggregatorClient } from '../functional/TestAggregatorClient.js';
import { mintToken, transferToken } from '../utils/TokenUtils.js';

/**
 * End-to-end worker verification: compiles the SDK and spawns REAL worker threads running
 * `lib/.../TransferTransactionVerifierWorker.js` — the artifact production Node loads.
 */
const WORKER_PATH = path.resolve(
  process.cwd(),
  'lib/transaction/verification/worker/nodejs/TransferTransactionVerifierWorker.js',
);

/** The same adapter NodeTokenVerifier uses, pointed at a configurable script path. */
class LibNodeWorker implements IWorker {
  public onerror: ((event: { message: string }) => void) | null = null;
  public onmessage: ((event: { data: TransferTransactionVerificationResponse }) => void) | null = null;

  public constructor(private readonly worker: Worker) {
    worker.on('message', (message: TransferTransactionVerificationResponse) => this.onmessage?.({ data: message }));
    worker.on('error', (error: Error) => this.onerror?.({ message: error.message }));
  }

  public postMessage(message: ITransferTransactionVerificationRequest): void {
    this.worker.postMessage(message);
  }

  public terminate(): void {
    void this.worker.terminate();
  }
}

class LibNodeTokenVerifier extends WorkerTokenVerifier {
  public constructor(
    poolSize: number,
    private readonly workerPath: string = WORKER_PATH,
  ) {
    super(poolSize);
  }

  protected createWorker(): IWorker {
    return new LibNodeWorker(new Worker(this.workerPath));
  }
}

describe('Node worker verification (real threads, compiled lib)', () => {
  const aggregatorClient = TestAggregatorClient.create();
  const client = new StateTransitionClient(aggregatorClient);
  const trustBase = aggregatorClient.rootTrustBase;

  let context: IVerificationContext;
  let token: Token;

  beforeAll(async () => {
    // Compile lib/ so the spawned threads load the current sources; a worker thread runs
    // plain Node and cannot execute TypeScript through jest's transform.
    execSync('npm run build', { cwd: process.cwd(), stdio: 'pipe' });
    if (!existsSync(WORKER_PATH)) {
      throw new Error(`Missing ${WORKER_PATH} after build.`);
    }

    context = new VerificationContext(
      trustBase,
      PredicateVerifierService.create(),
      new MintJustificationVerifierService(),
      new TokenIssuanceVerifierService(false),
    );

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
    token = await transferToken(client, context, bobToken.toCBOR(), SignaturePredicate.create(carol.publicKey), bob);
    expect(token.transactions.length).toEqual(2);
  }, 120000);

  it('verifies a token across real worker threads and reuses the pool', async () => {
    const verifier = new LibNodeTokenVerifier(2);
    try {
      const first = await verifier.verify(token, context);
      const second = await verifier.verify(token, context);
      expect([first.status, second.status]).toEqual([VerificationStatus.OK, VerificationStatus.OK]);
    } finally {
      verifier.dispose();
    }
  }, 60000);

  it('rejects when the worker script cannot be loaded', async () => {
    const verifier = new LibNodeTokenVerifier(1, path.resolve(process.cwd(), 'lib/does-not-exist.js'));
    try {
      await expect(verifier.verify(token, context)).rejects.toThrow();
    } finally {
      verifier.dispose();
    }
  }, 60000);
});
