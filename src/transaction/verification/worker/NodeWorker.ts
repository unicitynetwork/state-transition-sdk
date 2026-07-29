import { Worker } from 'node:worker_threads';

import { IWorker } from './IWorker.js';
import {
  ITransferTransactionVerificationRequest,
  TransferTransactionVerificationResponse,
} from './WorkerTokenVerifier.js';

/**
 * Adapts a Node `worker_threads.Worker` to the web {@link IWorker} shape, for use in a
 * {@link WorkerTokenVerifier} subclass's `createWorker`:
 * `new NodeWorker(new Worker(new URL('./MyWorker.js', import.meta.url)))`.
 */
export class NodeWorker implements IWorker {
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
