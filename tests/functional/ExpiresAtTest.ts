import { TestAggregatorClient } from './TestAggregatorClient.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { expiredExpiresAt, expiresAt } from '../utils/ExpiresAt.js';

describe('Certification request timeout', () => {
  const aggregatorClient = TestAggregatorClient.create();
  const client = new StateTransitionClient(aggregatorClient);
  const recipient = SignaturePredicate.create(SigningService.generate().publicKey);

  const submit = async (timeout: bigint): Promise<string> => {
    const transaction = await MintTransaction.create(NetworkId.LOCAL, recipient, { expiresAt: timeout });
    const response = await client.submitCertificationRequest(await CertificationData.fromMintTransaction(transaction));

    return response.status;
  };

  it('accepts a request whose timeout is ahead of the round reference time', async () => {
    await expect(submit(expiresAt())).resolves.toEqual(String(CertificationStatus.SUCCESS));
  });

  it('rejects a request whose timeout the round reference time has already reached', async () => {
    await expect(submit(expiredExpiresAt())).resolves.toEqual(String(CertificationStatus.REQUEST_EXPIRED));
  });

  it('binds the timeout into the transaction hash', async () => {
    const first = await MintTransaction.create(NetworkId.LOCAL, recipient, { expiresAt: 1755000000n });
    const second = await MintTransaction.create(NetworkId.LOCAL, recipient, {
      expiresAt: 1755000001n,
      salt: first.salt,
      tokenType: first.tokenType,
    });

    await expect(second.calculateTransactionHash()).resolves.not.toEqual(await first.calculateTransactionHash());
  });

  it('rejects a version that does not match the field count', async () => {
    const transaction = await MintTransaction.create(NetworkId.LOCAL, recipient, { expiresAt: 1755000000n });
    const mismatched = transaction.toCBOR();
    expect(mismatched[4]).toBe(2);
    mismatched[4] = 1;

    await expect(MintTransaction.fromCBOR(mismatched)).rejects.toThrow('Unsupported MintTransaction version: 1');
  });
});
