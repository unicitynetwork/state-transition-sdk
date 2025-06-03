import { Authenticator, IAuthenticatorJson } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';

export class SubmitCommitmentRequest {
  public constructor(
    public readonly requestId: RequestId,
    public readonly transactionHash: DataHash,
    public readonly authenticator: Authenticator,
    public readonly receipt: boolean,
  ) {}

  public toJSON(): {
    requestId: string;
    transactionHash: string;
    authenticator: IAuthenticatorJson;
    receipt: boolean;
  } {
    return {
      requestId: this.requestId.toJSON(),
      transactionHash: this.transactionHash.toJSON(),
      authenticator: this.authenticator.toJSON(),
      receipt: this.receipt,
    };
  }
}