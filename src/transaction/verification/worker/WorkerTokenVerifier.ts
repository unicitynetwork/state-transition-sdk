import { ITokenVerifier } from '../ITokenVerifier.js';
import { IVerificationContext } from '../IVerificationContext.js';
import { IWorker } from './IWorker.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { InclusionProof } from '../../../api/InclusionProof.js';
import { DataHash } from '../../../crypto/hash/DataHash.js';
import { DataHasher } from '../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../crypto/hash/HashAlgorithm.js';
import { EncodedPredicate } from '../../../predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../../../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../../serialization/cbor/CborSerializer.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import type { CertifiedTransferTransaction } from '../../CertifiedTransferTransaction.js';
import type { Token } from '../../Token.js';
import { CertifiedMintTransactionVerificationRule } from '../rule/CertifiedMintTransactionVerificationRule.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from '../rule/InclusionProofVerificationRule.js';

/**
 * A single transfer encoded self-contained (see {@link WorkerTransferTransaction}) and its
 * index in the token.
 */
export interface IEncodedTransferTransaction {
  readonly bytes: Uint8Array;
  readonly index: number;
}

/**
 * The message posted to a worker: the transfers of one batch and the trust base serialised
 * as an opaque JSON blob for `RootTrustBase.fromJSON`.
 */
export interface ITransferTransactionVerificationRequest {
  readonly transfers: readonly IEncodedTransferTransaction[];
  readonly trustBase: unknown;
}

/**
 * One transfer's verification outcome as it crosses the worker boundary.
 */
export interface ITransferTransactionVerificationResult {
  readonly index: number;
  readonly message: string;
  readonly status: VerificationStatus;
}

/**
 * What a worker posts back: either the batch results, or an error to re-throw on the
 * main thread.
 */
export type TransferTransactionVerificationResponse = ITransferTransactionVerificationResult[] | { error: string };

/** A queued batch waiting for a free worker. */
interface IPoolTask {
  readonly reject: (error: Error) => void;
  readonly request: ITransferTransactionVerificationRequest;
  readonly resolve: (results: ITransferTransactionVerificationResult[]) => void;
}

/**
 * Turn a worker response into batch results, re-throwing any error the worker reported.
 *
 * @param {TransferTransactionVerificationResponse} response Raw response posted by the worker.
 * @returns {ITransferTransactionVerificationResult[]} The batch results.
 * @throws {Error} If the worker reported an error.
 */
function toBatchResults(response: TransferTransactionVerificationResponse): ITransferTransactionVerificationResult[] {
  if (Array.isArray(response)) {
    return response;
  }

  throw new Error(response.error);
}

/**
 * One certified transfer in the worker wire format: the original transfer CBOR together
 * with its inclusion proof and the chain-derived source state hash and lock script,
 * decodable and verifiable without the rest of the token.
 *
 * Private to this module — an internal wire format, not part of the public API.
 */
class WorkerTransferTransaction {
  private constructor(
    private readonly bytes: Uint8Array,
    public readonly sourceStateHash: DataHash,
    public readonly lockScript: EncodedPredicate,
    public readonly inclusionProof: InclusionProof,
  ) {}

  /**
   * Decode a self-contained transfer produced by {@link WorkerTransferTransaction.toCBOR}.
   *
   * @param {Uint8Array} bytes Self-contained CBOR.
   * @returns {WorkerTransferTransaction} Decoded transfer.
   */
  public static fromCBOR(bytes: Uint8Array): WorkerTransferTransaction {
    const data = CborDeserializer.decodeArray(bytes, 3);
    const certified = CborDeserializer.decodeArray(data[0], 2);

    return new WorkerTransferTransaction(
      certified[0],
      DataHash.fromImprint(CborDeserializer.decodeByteString(data[1])),
      EncodedPredicate.fromCBOR(data[2]),
      InclusionProof.fromCBOR(certified[1]),
    );
  }

  /**
   * Convert a certified transfer to self-contained CBOR: its own CBOR plus the derived
   * source state hash and lock script.
   *
   * @param {CertifiedTransferTransaction} transaction Transfer to convert.
   * @returns {Uint8Array} Self-contained CBOR for {@link WorkerTransferTransaction.fromCBOR}.
   */
  public static toCBOR(transaction: CertifiedTransferTransaction): Uint8Array {
    return CborSerializer.encodeArray(
      transaction.toCBOR(),
      CborSerializer.encodeByteString(transaction.sourceStateHash.imprint),
      transaction.lockScript.toCBOR(),
    );
  }

  /**
   * Compute the canonical hash of this transaction: the hash of the original transfer bytes.
   *
   * @returns {Promise<DataHash>} Transaction hash.
   */
  public calculateTransactionHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(this.bytes).digest();
  }

  /**
   * Verify this transfer's inclusion proof.
   *
   * @param {RootTrustBase} trustBase Root trust base.
   * @param {PredicateVerifierService} predicateVerifier Predicate verifier.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  public async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];
    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      this.inclusionProof,
      await this.calculateTransactionHash(),
      this.lockScript,
      this.sourceStateHash,
    );
    results.push(result);

    if (result.status !== InclusionProofVerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedTransferTransactionVerificationRule',
        VerificationStatus.FAIL,
        `Inclusion proof verification failed: ${result.status?.toString()}`,
        results,
      );
    }

    return new VerificationResult('CertifiedTransferTransactionVerificationRule', VerificationStatus.OK, '', results);
  }
}

/**
 * Verify every transfer in the request against its trust base with the built-in predicate
 * verifier.
 *
 * @param {ITransferTransactionVerificationRequest} request The batch to verify.
 * @returns {Promise<TransferTransactionVerificationResponse>} Batch results, or the error to report back.
 */
export async function verifyTransferTransactions(
  request: ITransferTransactionVerificationRequest,
): Promise<TransferTransactionVerificationResponse> {
  try {
    const trustBase = RootTrustBase.fromJSON(request.trustBase);
    const predicateVerifier = PredicateVerifierService.create();

    const results: ITransferTransactionVerificationResult[] = [];
    for (const transfer of request.transfers) {
      const transaction = WorkerTransferTransaction.fromCBOR(transfer.bytes);
      const result = await transaction.verify(trustBase, predicateVerifier);
      results.push({ index: transfer.index, message: result.message, status: result.status });
    }

    return results;
  } catch (error) {
    return { error: (error instanceof Error && error.stack) || String(error) };
  }
}

/**
 * Fixed-size pool of long-lived {@link IWorker}s, shared across every verification.
 * Workers are created lazily on demand, up to the pool size, and reused afterwards.
 * Batches queue and are dispatched to workers as they fall idle; a worker that errors is
 * terminated and dropped, and the lazy creation refills capacity on the next task.
 *
 * Private to this module — an implementation detail of {@link WorkerTokenVerifier}, not
 * part of the public API.
 */
class WorkerPool {
  private readonly idle: IWorker[] = [];
  private readonly queue: IPoolTask[] = [];
  private readonly size: number;
  private readonly workers: IWorker[] = [];

  public constructor(
    private readonly createWorker: () => IWorker,
    size: number,
  ) {
    this.size = Math.max(1, size);
  }

  /** Terminate every worker created so far. */
  public dispose(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
  }

  /**
   * Verify one batch on the next free worker.
   *
   * @param {ITransferTransactionVerificationRequest} request The batch to verify.
   * @returns {Promise<ITransferTransactionVerificationResult[]>} The batch results.
   */
  public run(request: ITransferTransactionVerificationRequest): Promise<ITransferTransactionVerificationResult[]> {
    return new Promise<ITransferTransactionVerificationResult[]>((resolve, reject) => {
      this.queue.push({ reject, request, resolve });
      this.dispatch();
    });
  }

  /** Take an idle worker, or create one if the pool is not yet at full size. */
  private acquire(): IWorker | undefined {
    const idleWorker = this.idle.pop();
    if (idleWorker !== undefined) {
      return idleWorker;
    }

    if (this.workers.length < this.size) {
      const worker = this.createWorker();
      this.workers.push(worker);
      return worker;
    }

    return undefined;
  }

  /** Dispatch queued batches to available workers until one side runs out. */
  private dispatch(): void {
    while (this.queue.length > 0) {
      const worker = this.acquire();
      if (worker === undefined) {
        return;
      }

      const task = this.queue.shift();
      if (task === undefined) {
        this.idle.push(worker);
        return;
      }

      worker.onmessage = (event): void => {
        this.idle.push(worker);
        this.dispatch();
        try {
          task.resolve(toBatchResults(event.data));
        } catch (error) {
          task.reject(error instanceof Error ? error : new Error(String(error)));
        }
      };

      worker.onerror = (event): void => {
        this.remove(worker);
        task.reject(new Error(event.message));
        this.dispatch();
      };
      worker.postMessage(task.request);
    }
  }

  /** Terminate a crashed worker and drop it from the pool; {@link acquire} refills on demand. */
  private remove(crashedWorker: IWorker): void {
    crashedWorker.terminate();
    const index = this.workers.indexOf(crashedWorker);
    if (index >= 0) {
      this.workers.splice(index, 1);
    }
  }
}

/**
 * Base for the SDK's worker-pool {@link ITokenVerifier} implementations (Node worker
 * threads, browser Web Workers). Verifies the genesis and walks the provenance on the
 * calling thread, and fans each token's transfer verifications out to a shared pool of
 * workers reused across every {@link verify}. A subclass supplies {@link createWorker}.
 *
 * Each worker rebuilds the trust base shipped with the batch and verifies with the
 * built-in predicate verifier; custom (non-built-in) predicate verifiers are not
 * available in the worker. Call {@link dispose} to terminate the pool.
 */
export abstract class WorkerTokenVerifier implements ITokenVerifier {
  private readonly pool: WorkerPool;

  protected constructor(private readonly poolSize: number) {
    this.pool = new WorkerPool(() => this.createWorker(), poolSize);
  }

  /** Terminate the worker pool. The verifier must not be used afterwards. */
  public dispose(): void {
    this.pool.dispose();
  }

  /**
   * @inheritDoc
   */
  public async verify(token: Token, context: IVerificationContext): Promise<VerificationResult<VerificationStatus>> {
    const trustBaseJson = context.trustBase.toJSON();
    const pending: Token[] = [token];
    const collectNestedToken = (nested: Token): void => {
      pending.push(nested);
    };

    const results: VerificationResult<unknown>[] = [];
    for (let tokenIndex = 0; tokenIndex < pending.length; tokenIndex++) {
      const current = pending[tokenIndex];
      const rule = `Token[${tokenIndex}:${current.id.toString()}]`;
      const tokenResults: VerificationResult<unknown>[] = [];

      const genesisResult = await CertifiedMintTransactionVerificationRule.verify(
        current.genesis,
        context,
        collectNestedToken,
      );
      tokenResults.push(genesisResult);
      if (genesisResult.status !== VerificationStatus.OK) {
        results.push(
          new VerificationResult(rule, VerificationStatus.FAIL, 'Genesis verification failed', tokenResults),
        );
        return new VerificationResult(
          'TokenVerification',
          VerificationStatus.FAIL,
          `${rule} verification failed`,
          results,
        );
      }

      const transactions = current.transactions;
      const transferResults = new Array<VerificationResult<VerificationStatus>>(transactions.length);
      if (transactions.length > 0) {
        const batches = await Promise.all(
          this.partition(transactions.length).map((indices) =>
            this.pool.run({
              transfers: indices.map((index) => ({
                bytes: WorkerTransferTransaction.toCBOR(transactions[index]),
                index,
              })),
              trustBase: trustBaseJson,
            }),
          ),
        );

        for (const batch of batches) {
          for (const result of batch) {
            transferResults[result.index] = new VerificationResult(
              'CertifiedTransferTransactionVerificationRule',
              result.status,
              result.message,
            );
          }
        }
      }

      const transferVerification = VerificationResult.fromResults('TokenTransferVerification', transferResults);
      tokenResults.push(transferVerification);
      if (transferVerification.status !== VerificationStatus.OK) {
        results.push(
          new VerificationResult(rule, VerificationStatus.FAIL, 'Transfer verification failed', tokenResults),
        );
        return new VerificationResult(
          'TokenVerification',
          VerificationStatus.FAIL,
          `${rule} verification failed`,
          results,
        );
      }

      results.push(new VerificationResult(rule, VerificationStatus.OK, '', tokenResults));
    }

    return new VerificationResult('TokenVerification', VerificationStatus.OK, '', results);
  }

  /**
   * Spread `[0, count)` round-robin across at most {@link poolSize} batches.
   *
   * @param {number} count Number of transfers to distribute.
   * @returns {number[][]} Non-empty index batches.
   */
  private partition(count: number): number[][] {
    const batchCount = Math.max(1, Math.min(this.poolSize, count));
    const batches: number[][] = Array.from({ length: batchCount }, () => []);
    for (let i = 0; i < count; i++) {
      batches[i % batchCount].push(i);
    }

    return batches;
  }

  /**
   * Create one worker running this SDK's batch handling.
   *
   * @returns {IWorker} A fresh worker.
   */
  protected abstract createWorker(): IWorker;
}
