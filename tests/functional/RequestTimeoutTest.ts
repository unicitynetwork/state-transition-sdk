import { TestAggregatorClient } from './TestAggregatorClient.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { expiredRequestTimeout, requestTimeout } from '../utils/RequestTimeout.js';

describe('Certification request timeout', () => {
  const aggregatorClient = TestAggregatorClient.create();
  const client = new StateTransitionClient(aggregatorClient);
  const recipient = SignaturePredicate.create(SigningService.generate().publicKey);

  const submit = async (timeout: bigint): Promise<string> => {
    const transaction = await MintTransaction.create(NetworkId.LOCAL, recipient, timeout);
    const response = await client.submitCertificationRequest(await CertificationData.fromMintTransaction(transaction));

    return response.status;
  };

  it('accepts a request whose timeout is ahead of the round reference time', async () => {
    await expect(submit(requestTimeout())).resolves.toEqual(String(CertificationStatus.SUCCESS));
  });

  it('rejects a request whose timeout the round reference time has already reached', async () => {
    await expect(submit(expiredRequestTimeout())).resolves.toEqual(String(CertificationStatus.REQUEST_EXPIRED));
  });

  it('binds the timeout into the transaction hash', async () => {
    const first = await MintTransaction.create(NetworkId.LOCAL, recipient, 1755000000n);
    const second = await MintTransaction.create(
      NetworkId.LOCAL,
      recipient,
      1755000001n,
      null,
      first.tokenType,
      first.salt,
    );

    await expect(second.calculateTransactionHash()).resolves.not.toEqual(await first.calculateTransactionHash());
  });
});
