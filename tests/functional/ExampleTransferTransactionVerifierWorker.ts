import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { IVerificationContext } from '../../src/transaction/verification/IVerificationContext.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../src/transaction/verification/VerificationContext.js';
import { NodeTransferTransactionVerifierWorker } from '../../src/transaction/verification/worker/NodeTransferTransactionVerifierWorker.js';

/**
 * Example Node.js worker entry script: verifies with the built-in predicate verifier and
 * empty registries, created once; each batch's context binds them to the shipped trust
 * base.
 *
 * In a real deployment this file is its own compiled module, spawned from a
 * {@link WorkerTokenVerifier} subclass's `createWorker` with
 * `new NodeWorker(new Worker(new URL('./ExampleTransferTransactionVerifierWorker.js', import.meta.url)))`.
 * In jest it runs on the main thread, where {@link bootstrap} is a no-op and `verify`
 * serves as the worker body for {@link FakeWorker}-based tests.
 */
export class ExampleTransferTransactionVerifierWorker extends NodeTransferTransactionVerifierWorker {
  private readonly mintJustificationVerifier = new MintJustificationVerifierService();
  private readonly predicateVerifier = PredicateVerifierService.create();
  private readonly tokenIssuanceVerifier = new TokenIssuanceVerifierService(false);

  protected createContext(trustBase: RootTrustBase): Promise<IVerificationContext> {
    return Promise.resolve(
      new VerificationContext(
        trustBase,
        this.predicateVerifier,
        this.mintJustificationVerifier,
        this.tokenIssuanceVerifier,
      ),
    );
  }
}

new ExampleTransferTransactionVerifierWorker().bootstrap();
