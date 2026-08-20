import config from './config.json' with { type: 'json' };
import { CustomPaymentData } from './CustomPaymentData.js';
import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { Asset } from '../../../src/payment/asset/Asset.js';
import { AssetId } from '../../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../../src/payment/asset/PaymentAssetCollection.js';
import { SplitMintJustification } from '../../../src/payment/SplitMintJustification.js';
import { SplitMintJustificationVerifier } from '../../../src/payment/SplitMintJustificationVerifier.js';
import { SplitTokenRequest } from '../../../src/payment/SplitTokenRequest.js';
import { TokenSplit } from '../../../src/payment/TokenSplit.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { SignaturePredicateUnlockScript } from '../../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { Token } from '../../../src/transaction/Token.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { MintJustificationVerifierService } from '../../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../../src/transaction/verification/VerificationContext.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import { requestTimeout } from '../../utils/RequestTimeout.js';
import { createUnicityCertificateVerifier } from '../../utils/UnicityCertificateVerifierFixture.js';
import trustBaseJson from '../trust-base.json' with { type: 'json' };

it('Token splitting', async () => {
  const aggregatorClient = new AggregatorClient(config.aggregatorUrl);
  const trustBase = RootTrustBase.fromJSON(trustBaseJson);

  const client = new StateTransitionClient(aggregatorClient);

  const predicateVerifier = PredicateVerifierService.create();
  const unicityCertificateVerifier = createUnicityCertificateVerifier();
  const mintJustificationVerifier = new MintJustificationVerifierService();
  mintJustificationVerifier.register(new SplitMintJustificationVerifier(CustomPaymentData.decode));
  const verificationContext = new VerificationContext(
    trustBase,
    predicateVerifier,
    unicityCertificateVerifier,
    mintJustificationVerifier,
    new TokenIssuanceVerifierService(false),
  );

  const ownerPrivateKey = HexConverter.decode(config.ownerPrivateKey);
  const ownerSigningService = new SigningService(ownerPrivateKey);
  const ownerPredicate = SignaturePredicate.fromSigningService(ownerSigningService);

  const textEncoder = new TextEncoder();

  const assets = [
    new Asset(new AssetId(textEncoder.encode('EUR')), 300n),
    new Asset(new AssetId(textEncoder.encode('USD')), 500n),
  ];

  const paymentData = new CustomPaymentData(PaymentAssetCollection.create(...assets), 'my other data');
  const networkId = NetworkId.LOCAL;
  const mintTransaction = await MintTransaction.create(
    networkId,
    ownerPredicate,
    requestTimeout(),
    await paymentData.encode(),
    TokenType.generate(),
  );

  let response = await client.submitCertificationRequest(await CertificationData.fromMintTransaction(mintTransaction));
  if (response.status !== String(CertificationStatus.SUCCESS)) {
    throw new Error(`Token mint certification failed: ${response.status}`);
  }

  const token = await Token.mint(
    await mintTransaction.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      unicityCertificateVerifier,
      await waitInclusionProof(client, trustBase, predicateVerifier, unicityCertificateVerifier, mintTransaction),
    ),
    verificationContext,
  );

  const requests = [
    SplitTokenRequest.create(
      ownerPredicate,
      new CustomPaymentData(
        PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('EUR')), 150n)),
        'split token',
      ),
    ),
    SplitTokenRequest.create(
      ownerPredicate,
      new CustomPaymentData(
        PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('EUR')), 150n)),
        'split token',
      ),
    ),
    SplitTokenRequest.create(
      ownerPredicate,
      new CustomPaymentData(
        PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('USD')), 500n)),
        'split token',
      ),
    ),
  ];

  const result = await TokenSplit.split(token, CustomPaymentData.decode, requests, requestTimeout());

  response = await client.submitCertificationRequest(
    await CertificationData.fromTransaction(
      result.burn.transaction,
      await SignaturePredicateUnlockScript.create(result.burn.transaction, ownerSigningService),
    ),
  );

  if (response.status !== String(CertificationStatus.SUCCESS)) {
    throw new Error(`Token certification failed: ${response.status}`);
  }

  const burntToken = await token.transfer(
    await result.burn.transaction.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      unicityCertificateVerifier,
      await waitInclusionProof(
        client,
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        result.burn.transaction,
      ),
    ),
    verificationContext,
  );

  let i = 1;
  for (const splitToken of result.tokens) {
    const mintTransaction = await MintTransaction.create(
      splitToken.networkId,
      splitToken.recipient,
      requestTimeout(),
      await splitToken.paymentData.encode(),
      splitToken.tokenType,
      splitToken.salt,
      SplitMintJustification.create(burntToken, splitToken.proofs).toCBOR(),
    );

    const certificationData = await CertificationData.fromMintTransaction(mintTransaction);

    const response = await client.submitCertificationRequest(certificationData);
    if (response.status !== String(CertificationStatus.SUCCESS)) {
      throw new Error(`Token certification failed: ${response.status}`);
    }

    const mintedSplitToken = await Token.mint(
      await mintTransaction.toCertifiedTransaction(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        await waitInclusionProof(client, trustBase, predicateVerifier, unicityCertificateVerifier, mintTransaction),
      ),
      verificationContext,
    );

    console.log(`Token[${i++}]: `, HexConverter.encode(mintedSplitToken.toCBOR()), '\n');
  }
}, 30000);
