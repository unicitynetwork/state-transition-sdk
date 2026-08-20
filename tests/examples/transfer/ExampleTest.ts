import config from './config.json' with { type: 'json' };
import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { SignaturePredicateUnlockScript } from '../../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { EncodedPredicate } from '../../../src/predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { StateMask } from '../../../src/transaction/StateMask.js';
import { Token } from '../../../src/transaction/Token.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../../src/transaction/TransferTransaction.js';
import { MintJustificationVerifierService } from '../../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../../src/transaction/verification/VerificationContext.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../../src/verification/VerificationStatus.js';
import { requestTimeout } from '../../utils/RequestTimeout.js';
import { createUnicityCertificateVerifier } from '../../utils/UnicityCertificateVerifierFixture.js';
import trustBaseJson from '../trust-base.json' with { type: 'json' };

async function receiveToken(client: StateTransitionClient, trustBase: RootTrustBase): Promise<string> {
  const predicateVerifier = PredicateVerifierService.create();
  const unicityCertificateVerifier = createUnicityCertificateVerifier();
  const verificationContext = new VerificationContext(
    trustBase,
    predicateVerifier,
    unicityCertificateVerifier,
    new MintJustificationVerifierService(),
    new TokenIssuanceVerifierService(false),
  );

  const ownerPrivateKey = HexConverter.decode(config.ownerPrivateKey);
  const ownerSigningService = new SigningService(ownerPrivateKey);
  const ownerPredicate = SignaturePredicate.fromSigningService(ownerSigningService);

  const mintTransaction = await MintTransaction.create(
    NetworkId.LOCAL,
    ownerPredicate,
    requestTimeout(),
    CborSerializer.encodeTextString('My custom data'),
    TokenType.generate(),
  );
  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);

  await client.submitCertificationRequest(certificationData);

  const token = await Token.mint(
    await mintTransaction.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      unicityCertificateVerifier,
      await waitInclusionProof(client, trustBase, predicateVerifier, unicityCertificateVerifier, mintTransaction),
    ),
    verificationContext,
  );

  return HexConverter.encode(token.toCBOR());
}

it('Token transfer', async () => {
  const aggregatorClient = new AggregatorClient(config.aggregatorUrl);
  const trustBase = RootTrustBase.fromJSON(trustBaseJson);
  const client = new StateTransitionClient(aggregatorClient);
  const predicateVerifier = PredicateVerifierService.create();
  const unicityCertificateVerifier = createUnicityCertificateVerifier();
  const verificationContext = new VerificationContext(
    trustBase,
    predicateVerifier,
    unicityCertificateVerifier,
    new MintJustificationVerifierService(),
    new TokenIssuanceVerifierService(false),
  );

  const ownerPrivateKey = HexConverter.decode(config.ownerPrivateKey);
  const ownerSigningService = new SigningService(ownerPrivateKey);

  const tokenCBOR = HexConverter.decode(await receiveToken(client, trustBase));

  const token = await Token.fromCBOR(tokenCBOR);
  const result = await token.verify(verificationContext);
  if (result.status !== VerificationStatus.OK) {
    throw new Error(`Token verification failed: ${result.status}`);
  }

  const recipient = EncodedPredicate.fromCBOR(HexConverter.decode(config.address));

  const transferTransaction = await TransferTransaction.create(
    token,
    recipient,
    StateMask.generate(),
    requestTimeout(),
    CborSerializer.encodeTextString('My custom transfer data'),
  );

  const certificationData = await CertificationData.fromTransaction(
    transferTransaction,
    await SignaturePredicateUnlockScript.create(transferTransaction, ownerSigningService),
  );

  const response = await client.submitCertificationRequest(certificationData);

  if (response.status !== String(CertificationStatus.SUCCESS)) {
    throw new Error(`Token certification failed: ${response.status}`);
  }

  const transferToken = await token.transfer(
    await transferTransaction.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      unicityCertificateVerifier,
      await waitInclusionProof(client, trustBase, predicateVerifier, unicityCertificateVerifier, transferTransaction),
    ),
    verificationContext,
  );

  console.log(HexConverter.encode(transferToken.toCBOR()));
}, 30000);
