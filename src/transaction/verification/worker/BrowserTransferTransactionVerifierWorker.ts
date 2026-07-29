import { ITransferTransactionVerificationRequest, TransferTransactionVerifier } from './WorkerTokenVerifier.js';

declare const WorkerGlobalScope: object;
declare function addEventListener(
  type: 'message',
  listener: (event: { data: ITransferTransactionVerificationRequest }) => void,
): void;
declare function postMessage(message: unknown): void;

/**
 * Base for browser worker entry scripts: a {@link TransferTransactionVerifier} that runs
 * itself in the Web Worker. A consumer entry script extends it with its predicate
 * verifier, instantiates it and calls {@link bootstrap}; a {@link WorkerTokenVerifier}
 * subclass's `createWorker` spawns that script.
 */
export abstract class BrowserTransferTransactionVerifierWorker extends TransferTransactionVerifier {
  /**
   * Verify every transfer batch posted to the worker with this verifier. No-op on the
   * main thread, where `WorkerGlobalScope` is not exposed.
   */
  public bootstrap(): void {
    if (typeof WorkerGlobalScope === 'undefined') {
      return;
    }

    addEventListener('message', (event) => {
      void this.verify(event.data).then((response) => postMessage(response));
    });
  }
}
