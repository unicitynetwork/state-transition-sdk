import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { NetworkId } from '../../../../src/api/NetworkId.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { createRootTrustBase } from '../../../utils/RootTrustBaseFixture.js';

/** Seal body shared by every seal built here, so their content hashes match. */
const SEAL_CONTENT_HASH = new Uint8Array(32).fill(0x11);

function signingServiceFrom(fill: number): SigningService {
  return new SigningService(new Uint8Array(32).fill(fill));
}

function sealSignedBy(signingService: SigningService): Promise<UnicitySeal> {
  return UnicitySeal.create(NetworkId.LOCAL, 0n, 0n, 0n, null, SEAL_CONTENT_HASH, new Map([['NODE', signingService]]));
}

describe('UnicitySealQuorumSignaturesVerificationRule', () => {
  const rootNode = signingServiceFrom(0x01);
  const impostor = signingServiceFrom(0x02);

  let verifySpy: jest.SpyInstance;

  beforeEach(() => {
    verifySpy = jest.spyOn(SigningService, 'verifyWithPublicKey');
  });

  afterEach(() => {
    verifySpy.mockRestore();
  });

  it('verifies a quorum seal, then serves the repeat from the memo', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const seal = await sealSignedBy(rootNode);

    const first = await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, seal);
    expect(first.status).toEqual(VerificationStatus.OK);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    const second = await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, seal);
    expect(second.status).toEqual(VerificationStatus.OK);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });

  // The memo must key on the seal's COMPLETE encoding, not on calculateHash():
  // that hash deliberately excludes the signatures (it is what the root nodes
  // sign), so two seals with the same body but different signatures share it.
  // Keyed on it, this forged seal would be served a cached OK and its bogus
  // signatures would never be checked.
  it('rejects a seal whose signatures were replaced, even after the genuine one was memoised', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const genuine = await sealSignedBy(rootNode);
    const forged = await sealSignedBy(impostor);

    // The trap: identical bodies, hence identical signature-excluding hashes.
    expect((await forged.calculateHash()).toString()).toEqual((await genuine.calculateHash()).toString());

    expect((await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, genuine)).status).toEqual(
      VerificationStatus.OK,
    );

    const result = await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, forged);
    expect(result.status).toEqual(VerificationStatus.FAIL);
  });

  it('does not memoise across trust bases, since the outcome depends on the root nodes', async () => {
    const seal = await sealSignedBy(rootNode);

    await UnicitySealQuorumSignaturesVerificationRule.verify(createRootTrustBase(rootNode.publicKey), seal);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    // A different trust base instance must re-verify rather than inherit the memo.
    const other = await UnicitySealQuorumSignaturesVerificationRule.verify(
      createRootTrustBase(rootNode.publicKey),
      seal,
    );
    expect(other.status).toEqual(VerificationStatus.OK);
    expect(verifySpy).toHaveBeenCalledTimes(2);
  });

  it('does not memoise a seal that fails to reach quorum', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const seal = await sealSignedBy(impostor);

    expect((await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, seal)).status).toEqual(
      VerificationStatus.FAIL,
    );
    expect(verifySpy).toHaveBeenCalledTimes(1);

    expect((await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, seal)).status).toEqual(
      VerificationStatus.FAIL,
    );
    expect(verifySpy).toHaveBeenCalledTimes(2);
  });
});
