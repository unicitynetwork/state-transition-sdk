import config from './config.json' with { type: 'json' };
import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../../src/api/bft/RootTrustBase.js';
import { UnicityCertificateVerifier } from '../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { Secp256k1SignatureVerifier } from '../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { Token } from '../../../src/transaction/Token.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { MintJustificationVerifierService } from '../../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../../src/transaction/verification/VerificationContext.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import trustBaseJson from '../trust-base.json' with { type: 'json' };

it('Token minting', async () => {
  const aggregatorClient = new AggregatorClient(config.aggregatorUrl);
  const trustBase = RootTrustBase.fromJSON(trustBaseJson);

  const client = new StateTransitionClient(aggregatorClient);

  const predicateVerifier = PredicateVerifierService.create();
  const unicityCertificateVerifier = new UnicityCertificateVerifier(new Secp256k1SignatureVerifier());
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

  console.log(HexConverter.encode(token.toCBOR()));
}, 30000);
