import { isMainThread, parentPort } from 'node:worker_threads';

import { ITransferTransactionVerificationRequest, TransferTransactionVerifier } from './WorkerTokenVerifier.js';

/**
 * Base for Node.js worker entry scripts: a {@link TransferTransactionVerifier} that runs
 * itself in the worker thread. A consumer entry script extends it with its predicate
 * verifier, instantiates it and calls {@link bootstrap}; a
 * {@link WorkerTokenVerifier} subclass's `createWorker` spawns that script.
 */
export abstract class NodeTransferTransactionVerifierWorker extends TransferTransactionVerifier {
  /**
   * Verify every transfer batch posted on the parent port with this verifier. No-op when
   * called outside a worker thread.
   */
  public bootstrap(): void {
    if (isMainThread || parentPort === null) {
      return;
    }

    const port = parentPort;
    port.on('message', (request: ITransferTransactionVerificationRequest) => {
      void this.verify(request).then((response) => port.postMessage(response));
    });
  }
}
