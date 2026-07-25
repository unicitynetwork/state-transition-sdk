import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { JsonRpcNetworkError } from '../api/json-rpc/JsonRpcNetworkError.js';
import { StateId } from '../api/StateId.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../StateTransitionClient.js';
import { ITransaction } from '../transaction/ITransaction.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from '../transaction/verification/rule/InclusionProofVerificationRule.js';

/**
 * Thrown by {@link waitInclusionProof} when the polling sleep is aborted
 * (typically because the caller's abort signal fired).
 */
class SleepError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SleepError';
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(signal.reason as Error);
      },
      { once: true },
    );
  });
}

/**
 * Poll the aggregator until a valid inclusion proof for the given transaction
 * is available, or the abort signal fires.
 *
 * @param {StateTransitionClient} client Client used to fetch inclusion proofs.
 * @param {RootTrustBase} trustBase Root trust base used to verify the inclusion certificate.
 * @param {PredicateVerifierService} predicateVerifier Verifier used to check the transaction predicate.
 * @param {ITransaction} transaction Transaction whose inclusion is being awaited.
 * @param {AbortSignal} signal Abort signal that terminates polling. Defaults to a 10s timeout.
 * @param {number} interval Delay between polls in milliseconds. Defaults to 1000.
 * @returns {Promise<InclusionProof>} Verified inclusion proof.
 * @throws {SleepError} If the abort signal fires while sleeping between polls.
 */
export async function waitInclusionProof(
  client: StateTransitionClient,
  trustBase: RootTrustBase,
  predicateVerifier: PredicateVerifierService,
  transaction: ITransaction,
  signal: AbortSignal = AbortSignal.timeout(10000),
  interval: number = 1000,
): Promise<InclusionProof> {
  const stateId = await StateId.fromTransaction(transaction);
  const transactionHash = await transaction.calculateTransactionHash();
  while (true) {
    try {
      const inclusionProof = await client.getInclusionProof(stateId).then((response) => response.inclusionProof);
      const verificationStatus = await InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        inclusionProof,
        transactionHash,
        transaction.lockScript,
        transaction.sourceStateHash,
      );

      switch (verificationStatus.status) {
        case InclusionProofVerificationStatus.OK:
          return inclusionProof;
        case InclusionProofVerificationStatus.INCLUSION_CERTIFICATE_MISSING:
          break;
        default:
          throw new Error(`Invalid inclusion proof status: ${verificationStatus.status}`);
      }
    } catch (err) {
      if (!(err instanceof JsonRpcNetworkError && err.status === 404)) {
        throw err;
      }
    }

    try {
      await sleep(interval, signal);
    } catch (err) {
      throw new SleepError(err?.toString() || 'Sleep was aborted');
    }
  }
}
