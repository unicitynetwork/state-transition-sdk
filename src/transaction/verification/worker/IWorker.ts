import type {
  ITransferTransactionVerificationRequest,
  TransferTransactionVerificationResponse,
} from './WorkerTokenVerifier.js';

/**
 * The subset of the web {@link https://developer.mozilla.org/en-US/docs/Web/API/Worker | Worker}
 * shape this SDK drives. Browsers implement it natively; Node wraps `worker_threads.Worker`
 * to match.
 */
export interface IWorker {
  onerror: ((event: { message: string }) => void) | null;
  onmessage: ((event: { data: TransferTransactionVerificationResponse }) => void) | null;
  postMessage(message: ITransferTransactionVerificationRequest): void;
  terminate(): void;
}
