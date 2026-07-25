import { isMainThread, parentPort } from 'node:worker_threads';

import { verifyTransferTransactions, ITransferTransactionVerificationRequest } from '../WorkerTokenVerifier.js';

/**
 * Worker entry for {@link NodeTokenVerifier}: verifies every transfer batch posted on the
 * parent port. Inert when loaded outside a worker thread.
 */
if (!isMainThread && parentPort !== null) {
  const port = parentPort;
  port.on('message', (request: ITransferTransactionVerificationRequest) => {
    void verifyTransferTransactions(request).then((response) => port.postMessage(response));
  });
}
