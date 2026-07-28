import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { NodeTransferTransactionVerifierWorker } from '../../src/transaction/verification/worker/NodeTransferTransactionVerifierWorker.js';

/**
 * Example Node.js worker entry script: verifies with the built-in predicate verifier,
 * created once and shared across batches.
 *
 * In a real deployment this file is its own compiled module, spawned from a
 * {@link WorkerTokenVerifier} subclass's `createWorker` with
 * `new NodeWorker(new Worker(new URL('./ExampleTransferTransactionVerifierWorker.js', import.meta.url)))`.
 * In jest it runs on the main thread, where {@link bootstrap} is a no-op and `verify`
 * serves as the worker body for {@link FakeWorker}-based tests.
 */
export class ExampleTransferTransactionVerifierWorker extends NodeTransferTransactionVerifierWorker {
  private readonly verifier = PredicateVerifierService.create();

  protected get predicateVerifier(): PredicateVerifierService {
    return this.verifier;
  }
}

new ExampleTransferTransactionVerifierWorker().bootstrap();
