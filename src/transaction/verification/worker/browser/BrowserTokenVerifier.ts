import { IWorker } from '../IWorker.js';
import { WorkerTokenVerifier } from '../WorkerTokenVerifier.js';

/*
 * This module is browser-only, but the SDK compiles against Node types without the DOM
 * lib, so the browser `Worker` global is declared manually. The declaration is erased at
 * compile time and resolves to the real global at runtime.
 */
declare const Worker: new (scriptUrl: URL, options?: { type?: string }) => IWorker;

const DEFAULT_POOL_SIZE = 4;

/**
 * {@link ITokenVerifier} for the browser: verifies a token's transfers in parallel across
 * a shared pool of Web Workers running the sibling `TransferTransactionVerifierWorker.js`.
 * The genesis and provenance walk run on the calling thread. Call {@link dispose} to
 * terminate the pool.
 *
 * @see WorkerTokenVerifier for the pool and the worker protocol.
 */
export class BrowserTokenVerifier extends WorkerTokenVerifier {
  /**
   * @param {number} poolSize Number of workers to keep.
   */
  public constructor(poolSize: number = DEFAULT_POOL_SIZE) {
    super(poolSize);
  }

  /**
   * @inheritDoc
   */
  protected createWorker(): IWorker {
    return new Worker(new URL('./TransferTransactionVerifierWorker.js', import.meta.url), { type: 'module' });
  }
}
