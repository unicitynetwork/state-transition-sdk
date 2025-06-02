import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { CoinId } from './CoinId.js';
import { ISerializable } from '../../ISerializable.js';

/** JSON representation for coin balances. */
export type TokenCoinDataJson = [string, string][];

/**
 * Container for fungible coin balances attached to a token.
 */
export class TokenCoinData implements ISerializable {
  private readonly _coins: Map<string, bigint>;

  /**
   * @param coins Array of coin id and balance pairs
   */
  public constructor(coins: [CoinId, bigint][]) {
    this._coins = new Map(coins.map(([key, value]) => [key.toJSON(), value]));
  }

  /** List of coins held. */
  public get coins(): [CoinId, bigint][] {
    return Array.from(this._coins.entries()).map(([key, value]) => [CoinId.fromDto(key), value]);
  }

  /** Create a coin data object from CBOR. */
  public static fromCBOR(data: Uint8Array): TokenCoinData {
    const coins: [CoinId, bigint][] = [];
    const entries = CborDecoder.readArray(data);
    for (const item of entries) {
      const [key, value] = CborDecoder.readArray(item);
      coins.push([CoinId.fromDto(CborDecoder.readTextString(key)), CborDecoder.readUnsignedInteger(value)]);
    }

    return new TokenCoinData(coins);
  }

  /** Parse from a JSON representation. */
  public static fromJSON(data: unknown): TokenCoinData {
    if (!Array.isArray(data)) {
      throw new Error('Invalid coin data JSON format');
    }

    const coins: [CoinId, bigint][] = [];
    for (const [key, value] of data) {
      coins.push([CoinId.fromDto(key), BigInt(value)]);
    }

    return new TokenCoinData(coins);
  }

  /** Encode balances as CBOR. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray(
      Array.from(this._coins.entries()).map(([key, value]) =>
        CborEncoder.encodeArray([CborEncoder.encodeTextString(key), CborEncoder.encodeUnsignedInteger(value)]),
      ),
    );
  }

  /** Convert balances to JSON-friendly tuples. */
  public toJSON(): TokenCoinDataJson {
    return Array.from(this._coins.entries()).map(([key, value]) => [key, value.toString()]);
  }

  /** Human readable list of coin balances. */
  public toString(): string {
    return dedent`
      FungibleTokenData
        ${Array.from(this._coins.entries())
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')}`;
  }
}
