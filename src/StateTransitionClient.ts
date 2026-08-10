import { CertificationData } from './api/CertificationData.js';
import { CertificationResponse } from './api/CertificationResponse.js';
import { IAggregatorClient } from './api/IAggregatorClient.js';
import { InclusionProofResponse } from './api/InclusionProofResponse.js';
import { IRequestOptions } from './api/IRequestOptions.js';
import { StateId } from './api/StateId.js';

/**
 * High-level facade over an {@link IAggregatorClient}. Provides the two
 * operations a state-transition flow needs: fetching an inclusion proof for a
 * known state ID and submitting a certification request.
 */
export class StateTransitionClient {
  public constructor(private readonly client: IAggregatorClient) {}

  /**
   * Retrieve the inclusion proof for a given state id.
   *
   * @param {StateId} stateId State id whose inclusion proof to retrieve.
   * @param {IRequestOptions} options Optional per-request options, e.g. an abort signal.
   * @returns {Promise<InclusionProofResponse>} Inclusion proof response from the aggregator.
   */
  public getInclusionProof(stateId: StateId, options?: IRequestOptions): Promise<InclusionProofResponse> {
    return this.client.getInclusionProof(stateId, options);
  }

  /**
   * Submit a certification request derived from the given certification data.
   *
   * @param {CertificationData} certificationData Certification data to submit.
   * @param {IRequestOptions} options Optional per-request options, e.g. an abort signal.
   * @returns {Promise<CertificationResponse>} Certification response from the aggregator.
   */
  public submitCertificationRequest(
    certificationData: CertificationData,
    options?: IRequestOptions,
  ): Promise<CertificationResponse> {
    return this.client.submitCertificationRequest(certificationData, options);
  }
}
