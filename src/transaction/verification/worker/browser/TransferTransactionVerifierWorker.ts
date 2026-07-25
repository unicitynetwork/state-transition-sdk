import { verifyTransferTransactions, ITransferTransactionVerificationRequest } from '../WorkerTokenVerifier.js';

declare const WorkerGlobalScope: object;
declare function addEventListener(
  type: 'message',
  listener: (event: { data: ITransferTransactionVerificationRequest }) => void,
): void;
declare function postMessage(message: unknown): void;

/**
 * Worker entry for {@link BrowserTokenVerifier}: verifies every transfer batch posted to
 * the worker. Inert on the main thread, where `WorkerGlobalScope` is not exposed.
 */
if (typeof WorkerGlobalScope !== 'undefined') {
  addEventListener('message', (event) => {
    void verifyTransferTransactions(event.data).then((response) => postMessage(response));
  });
}
