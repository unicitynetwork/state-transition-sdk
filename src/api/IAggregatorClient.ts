import { CertificationData } from './CertificationData.js';
import { CertificationResponse } from './CertificationResponse.js';
import { InclusionProofResponse } from './InclusionProofResponse.js';
import { IRequestOptions } from './IRequestOptions.js';
import { StateId } from './StateId.js';

/**
 * Client interface for interacting with an aggregator service.
 */
export interface IAggregatorClient {
  /**
   * Retrieve an inclusion proof for the given state id.
   *
   * @param {StateId} stateId State identifier to query.
   * @param {IRequestOptions} options Optional per-request options, e.g. an abort signal.
   * @returns {Promise<InclusionProofResponse>} Inclusion proof response from the aggregator.
   */
  getInclusionProof(stateId: StateId, options?: IRequestOptions): Promise<InclusionProofResponse>;

  /**
   * Submit a transaction commitment for inclusion in the ledger.
   *
   * @param {CertificationData} certificationData Certification data to submit.
   * @param {IRequestOptions} options Optional per-request options, e.g. an abort signal.
   * @returns {Promise<CertificationResponse>} Certification response from the aggregator.
   */
  submitCertificationRequest(
    certificationData: CertificationData,
    options?: IRequestOptions,
  ): Promise<CertificationResponse>;
}
