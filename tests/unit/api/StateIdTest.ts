import { NetworkId } from '../../../src/api/NetworkId.js';
import { StateId } from '../../../src/api/StateId.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { requestTimeout } from '../../utils/RequestTimeout.js';

describe('StateId', () => {
  it('should encode and decode to exactly same object', async () => {
    const stateId = await StateId.fromTransaction(
      await MintTransaction.create(
        NetworkId.MAINNET,
        SignaturePredicate.create(
          HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026'),
        ),
        requestTimeout(),
        null,
        new TokenType(new Uint8Array(32)),
        TokenSalt.fromBytes(new Uint8Array(32)),
      ),
    );

    expect(HexConverter.encode(stateId.toCBOR())).toStrictEqual(
      '5820ffb36b55de9bfaf48b766d1f4e041a6c5d35ba23b402ea2a56a6c7692cb8f81a',
    );
    expect(StateId.fromCBOR(stateId.toCBOR())).toStrictEqual(stateId);
  });
});
