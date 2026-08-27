import { TestAggregatorClient } from './TestAggregatorClient.js';
import { InclusionProof } from '../../src/api/InclusionProof.js';
import { InclusionProofResponse } from '../../src/api/InclusionProofResponse.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../../src/serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { Token } from '../../src/transaction/Token.js';
import { TransferTransaction } from '../../src/transaction/TransferTransaction.js';
import { IVerificationContext } from '../../src/transaction/verification/IVerificationContext.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../src/transaction/verification/VerificationContext.js';
import { expiresAt } from '../utils/ExpiresAt.js';
import { mintToken, transferToken } from '../utils/TokenUtils.js';
import { createUnicityCertificateVerifier } from '../utils/UnicityCertificateVerifierFixture.js';

describe('Certified transaction wire format', () => {
  const aggregatorClient = TestAggregatorClient.create();
  const client = new StateTransitionClient(aggregatorClient);
  const trustBase = aggregatorClient.rootTrustBase;
  const alice = SigningService.generate();
  const bob = SigningService.generate();

  const context: IVerificationContext = new VerificationContext(
    trustBase,
    PredicateVerifierService.create(),
    createUnicityCertificateVerifier(),
    new MintJustificationVerifierService(),
    new TokenIssuanceVerifierService(false),
  );

  let deadline: bigint;
  let token: Token;

  beforeAll(async () => {
    deadline = expiresAt();
    token = await transferToken(
      client,
      context,
      (
        await mintToken(
          client,
          context,
          SignaturePredicate.create(alice.publicKey),
          null,
          trustBase.networkId,
          undefined,
          undefined,
          null,
          deadline,
        )
      ).toCBOR(),
      SignaturePredicate.create(bob.publicKey),
      alice,
      deadline,
    );
  }, 30000);

  // The reference time used to be written beside the proof that already
  // carries it, costing an extra element plus a consistency check at every
  // decode. The service records the leaf's creation time on the record and
  // serves the same value for every proof of that leaf, so the proof is the
  // single source and the copy is gone.
  it('carries the transaction and its proof, and nothing else', () => {
    for (const bytes of [token.genesis.toCBOR(), ...token.transactions.map((t) => t.toCBOR())]) {
      expect(CborDeserializer.decodeArray(bytes)).toHaveLength(2);
    }
  });

  it('reads the reference time back off the proof', async () => {
    const round = await Token.fromCBOR(token.toCBOR());

    expect(round.genesis.referenceTime).toEqual(round.genesis.inclusionProof.referenceTime);
    expect(round.transactions[0].referenceTime).toEqual(round.transactions[0].inclusionProof.referenceTime);
    await expect(round.verify(context).then((result) => result.status)).resolves.toEqual('OK');
  }, 30000);

  // A certified transaction can no longer be handed a proof that describes no leaf: the type
  // cannot express one. The absence lives on the response instead, and InclusionProof refuses it.
  it('cannot represent a certified transaction whose proof has no leaf', () => {
    const uncertified = new InclusionProofResponse(1n, null, token.genesis.inclusionProof.unicityCertificate);

    expect(uncertified.inclusionProof).toBeNull();
    expect(() => InclusionProof.fromCBOR(CborDeserializer.decodeArray(uncertified.toCBOR(), 2)[1])).toThrow(
      'Expected a certified leaf, but the inclusion proof reports none.',
    );
    // ...and it survives the round trip as an absence rather than becoming a half-formed proof.
    expect(InclusionProofResponse.fromCBOR(uncertified.toCBOR()).inclusionProof).toBeNull();
  });

  // Every structure the token embeds changed shape in this release. Without the
  // bump a token written by an older SDK passes the version check and then dies
  // on a CBOR array-length error that never mentions versioning.
  it('rejects a token written against a different version', async () => {
    const bytes = token.toCBOR();
    const elements = CborDeserializer.decodeArray(CborDeserializer.decodeTag(bytes).data, 3);
    expect(CborDeserializer.decodeUnsignedInteger(elements[0])).toEqual(2n);

    for (const badVersion of [1n, 3n]) {
      const mismatched = CborSerializer.encodeTag(
        Token.CBOR_TAG,
        CborSerializer.encodeArray(CborSerializer.encodeUnsignedInteger(badVersion), elements[1], elements[2]),
      );

      await expect(Token.fromCBOR(mismatched)).rejects.toThrow(`Unsupported Token version: ${badVersion}`);
    }
  });

  // Nine other wire types expose their version; these three lost theirs in the
  // same release that changed their shape, leaving consumers no way to read it.
  it('exposes the wire version of every transaction type', async () => {
    const mint = await MintTransaction.create(trustBase.networkId, SignaturePredicate.create(alice.publicKey));
    const transfer = await TransferTransaction.create(
      token,
      SignaturePredicate.create(alice.publicKey),
      token.genesis.stateMask,
    );

    expect(mint.version).toEqual(MintTransaction.VERSION);
    expect(transfer.version).toEqual(TransferTransaction.VERSION);
    expect(token.genesis.inclusionProof.certificationData?.version).toEqual(2n);
  }, 30000);
});
