import { getEventListeners } from 'node:events';

import { UnicityCertificate } from '../../../src/api/bft/UnicityCertificate.js';
import { CertificationResponse } from '../../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../../src/api/IAggregatorClient.js';
import { InclusionProof } from '../../../src/api/InclusionProof.js';
import { InclusionProofResponse } from '../../../src/api/InclusionProofResponse.js';
import { IRequestOptions } from '../../../src/api/IRequestOptions.js';
import { JsonRpcNetworkError } from '../../../src/api/json-rpc/JsonRpcNetworkError.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { StateId } from '../../../src/api/StateId.js';
import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { SleepError, waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import { expiresAt } from '../../utils/ExpiresAt.js';
import { createRootTrustBase } from '../../utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from '../../utils/UnicityCertificateFixture.js';
import { createUnicityCertificateVerifier } from '../../utils/UnicityCertificateVerifierFixture.js';

interface IDeferred<T> {
  readonly promise: Promise<T>;
  reject(reason: unknown): void;
  resolve(value: T): void;
}

function createDeferred<T>(): IDeferred<T> {
  let reject!: (reason: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res, rej) => {
    reject = rej;
    resolve = res;
  });

  return { promise, reject, resolve };
}

/**
 * Aggregator client whose inclusion-proof responses are fully driven by the test.
 */
class StubAggregatorClient implements IAggregatorClient {
  public readonly requests: (IRequestOptions | undefined)[] = [];

  public constructor(private readonly handler: (call: number) => Promise<InclusionProofResponse>) {}

  public get callCount(): number {
    return this.requests.length;
  }

  public getInclusionProof(_stateId: StateId, options?: IRequestOptions): Promise<InclusionProofResponse> {
    this.requests.push(options);
    return this.handler(this.requests.length);
  }

  public submitCertificationRequest(): Promise<CertificationResponse> {
    throw new Error('Certification requests are not part of these tests.');
  }
}

describe('waitInclusionProof', () => {
  const signingService = SigningService.generate();
  const trustBase = createRootTrustBase(signingService.publicKey);
  const predicateVerifier = PredicateVerifierService.create();
  const unicityCertificateVerifier = createUnicityCertificateVerifier();

  let transaction: MintTransaction;
  let pendingCertificate: UnicityCertificate;

  beforeAll(async () => {
    transaction = await MintTransaction.create(NetworkId.LOCAL, SignaturePredicate.create(signingService.publicKey), {
      expiresAt: expiresAt(),
      salt: TokenSalt.generate(),
      tokenType: TokenType.generate(),
    });
    // A response with no proof is what the aggregator returns for a state it has not certified
    // yet, i.e. "keep polling".
    pendingCertificate = await createUnicityCertificate(
      new DataHash(HashAlgorithm.SHA256, new Uint8Array(32)),
      signingService,
    );
  });

  const wait = (aggregatorClient: IAggregatorClient, signal: AbortSignal, interval = 10): Promise<InclusionProof> =>
    waitInclusionProof(
      new StateTransitionClient(aggregatorClient),
      trustBase,
      predicateVerifier,
      unicityCertificateVerifier,
      transaction,
      signal,
      interval,
    );

  const notFound = (): Promise<InclusionProofResponse> =>
    Promise.reject(new JsonRpcNetworkError(404, 'Inclusion proof not found'));

  it('should reject when the deadline fires while a request is in flight', async () => {
    const started = createDeferred<void>();
    const response = createDeferred<InclusionProofResponse>();
    const controller = new AbortController();
    const client = new StubAggregatorClient(() => {
      started.resolve();
      return response.promise;
    });

    const result = wait(client, controller.signal);
    await started.promise;
    controller.abort(new Error('deadline reached'));

    await expect(result).rejects.toThrow(SleepError);
    expect(client.callCount).toBe(1);
    response.reject(new JsonRpcNetworkError(404, 'Inclusion proof not found'));
  });

  it('should reject when the signal fires before the abort listener could be attached', async () => {
    // The reported hang: the deadline elapses while the request is in flight, so
    // the loop only learns about it after the response has already been handled.
    // An `abort` listener registered at that point is never called.
    const controller = new AbortController();
    const client = new StubAggregatorClient(() => {
      controller.abort(new Error('deadline reached'));
      return notFound();
    });

    await expect(wait(client, controller.signal)).rejects.toThrow(SleepError);
    expect(client.callCount).toBe(1);
  });

  it('should reject when the signal fires while sleeping between polls', async () => {
    const client = new StubAggregatorClient(() => notFound());

    await expect(wait(client, AbortSignal.timeout(50), 1000)).rejects.toThrow(SleepError);
    expect(client.callCount).toBe(1);
  });

  it('should reject without issuing a request when the signal is already aborted', async () => {
    const client = new StubAggregatorClient(() => notFound());
    const controller = new AbortController();
    controller.abort(new Error('already gone'));

    await expect(wait(client, controller.signal)).rejects.toThrow(SleepError);
    expect(client.callCount).toBe(0);
  });

  it('should reject when a request never settles and ignores the signal', async () => {
    const started = createDeferred<void>();
    const controller = new AbortController();
    const client = new StubAggregatorClient(() => {
      started.resolve();
      return new Promise<InclusionProofResponse>(() => undefined);
    });

    const result = wait(client, controller.signal);
    await started.promise;
    controller.abort(new Error('deadline reached'));

    await expect(result).rejects.toThrow(SleepError);
  });

  it('should still end the wait when the abort reason cannot be described', async () => {
    // A reason without Object.prototype throws on any attempt to stringify it.
    // Building the error must not be what prevents the wait from ending.
    const controller = new AbortController();
    const client = new StubAggregatorClient(() => {
      controller.abort(Object.create(null));
      return notFound();
    });

    await expect(wait(client, controller.signal)).rejects.toThrow(SleepError);
  });

  it('should still end the wait when the signal refuses listener removal', async () => {
    const controller = new AbortController();
    const hostile = new Proxy(controller.signal, {
      get(target: AbortSignal, property: string | symbol): unknown {
        if (property === 'removeEventListener') {
          return (): never => {
            throw new Error('removal refused');
          };
        }
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const client = new StubAggregatorClient((call) => {
      if (call >= 2) {
        controller.abort(new Error('deadline reached'));
      }
      return notFound();
    });

    await expect(wait(client, hostile, 1)).rejects.toThrow(SleepError);
    expect(client.callCount).toBe(2);
  });

  it('should report the abort reason', async () => {
    const reason = new Error('deadline reached');
    const client = new StubAggregatorClient(() => notFound());
    const controller = new AbortController();
    controller.abort(reason);

    await expect(wait(client, controller.signal)).rejects.toThrow('Error: deadline reached');
    await expect(wait(client, controller.signal)).rejects.toMatchObject({ cause: reason, name: 'SleepError' });
  });

  it('should hand the aggregator client a plain abort signal that cancels the request', async () => {
    const controller = new AbortController();
    const client = new StubAggregatorClient(() => {
      controller.abort(new Error('deadline reached'));
      return notFound();
    });

    await expect(wait(client, controller.signal)).rejects.toThrow(SleepError);
    const requestSignal = client.requests[0]?.signal;
    // Not the caller's own signal: callers may pass a wrapper, and only a plain
    // AbortSignal can be handed to `fetch`.
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal).not.toBe(controller.signal);
    expect(requestSignal?.aborted).toBe(true);
  });

  it('should not cancel the next request because an earlier one was aborted', async () => {
    const client = new StubAggregatorClient(() => notFound());

    await expect(wait(client, AbortSignal.timeout(60), 1)).rejects.toThrow(SleepError);
    expect(client.callCount).toBeGreaterThan(1);
    expect(client.requests.slice(0, -1).every((options) => options?.signal?.aborted === false)).toBe(true);
  });

  it('should accept a signal wrapper that only exposes the AbortSignal surface', async () => {
    const controller = new AbortController();
    // Mirrors the defensive wrapper shipped downstream, which re-delivers
    // `abort` to listeners attached after the signal has already fired.
    const wrapped = new Proxy(controller.signal, {
      get(target: AbortSignal, property: string | symbol): unknown {
        if (property === 'addEventListener') {
          return (type: string, listener: EventListener, options?: AddEventListenerOptions): void => {
            if (type === 'abort' && target.aborted) {
              queueMicrotask(() => listener.call(target, new Event('abort')));
              return;
            }
            target.addEventListener(type, listener, options);
          };
        }
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const client = new StubAggregatorClient(() => {
      controller.abort(new Error('deadline reached'));
      return notFound();
    });

    await expect(wait(client, wrapped)).rejects.toThrow(SleepError);
    expect(client.requests[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('should keep polling while the inclusion certificate is missing', async () => {
    const controller = new AbortController();
    const client = new StubAggregatorClient((call) => {
      if (call >= 3) {
        controller.abort(new Error('deadline reached'));
      }
      return Promise.resolve(InclusionProofResponse.notCertified(1n, pendingCertificate));
    });

    await expect(wait(client, controller.signal, 1)).rejects.toThrow(SleepError);
    expect(client.callCount).toBe(3);
  });

  it('should not accumulate abort listeners across polls', async () => {
    const controller = new AbortController();
    const listeners: number[] = [];
    const client = new StubAggregatorClient((call) => {
      listeners.push(getEventListeners(controller.signal, 'abort').length);
      if (call >= 5) {
        controller.abort(new Error('deadline reached'));
      }
      return notFound();
    });

    await expect(wait(client, controller.signal, 1)).rejects.toThrow(SleepError);
    expect(Math.max(...listeners)).toBeLessThanOrEqual(1);
  });

  it('should propagate a non-404 error instead of retrying', async () => {
    const client = new StubAggregatorClient(() => Promise.reject(new JsonRpcNetworkError(500, 'Server error')));

    await expect(wait(client, AbortSignal.timeout(1000))).rejects.toThrow(JsonRpcNetworkError);
    expect(client.callCount).toBe(1);
  });

  it('should report the abort rather than the outcome of a poll it no longer waits for', async () => {
    const controller = new AbortController();
    const client = new StubAggregatorClient(() => {
      controller.abort(new Error('deadline reached'));
      return Promise.reject(new JsonRpcNetworkError(500, 'Server error'));
    });

    await expect(wait(client, controller.signal)).rejects.toThrow(SleepError);
  });
});
