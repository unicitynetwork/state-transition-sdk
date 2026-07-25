import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

import { IWorker } from '../IWorker.js';
import {
  ITransferTransactionVerificationRequest,
  TransferTransactionVerificationResponse,
  WorkerTokenVerifier,
} from '../WorkerTokenVerifier.js';

/**
 * Adapts a Node `worker_threads.Worker` to the web {@link IWorker} shape.
 */
class NodeWorker implements IWorker {
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

/**
 * {@link ITokenVerifier} for Node.js: verifies a token's transfers in parallel across a
 * shared pool of `worker_threads` running the sibling `TransferTransactionVerifierWorker.js`.
 * The genesis and provenance walk run on the calling thread. Call {@link dispose} to
 * terminate the pool.
 *
 * @see WorkerTokenVerifier for the pool and the worker protocol.
 */
export class NodeTokenVerifier extends WorkerTokenVerifier {
  /**
   * @param {number} poolSize Number of workers to keep; defaults to the host's available parallelism.
   */
  public constructor(poolSize: number = availableParallelism()) {
    super(poolSize);
  }

  /**
   * @inheritDoc
   */
  protected createWorker(): IWorker {
    return new NodeWorker(new Worker(new URL('./TransferTransactionVerifierWorker.js', import.meta.url)));
  }
}
