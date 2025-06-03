import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { TokenId } from './TokenId.js';
import { ITokenStateJson, TokenState } from './TokenState.js';
import { TokenType } from './TokenType.js';
import { ISerializable } from '../ISerializable.js';
import { NameTagToken } from './NameTagToken.js';
import { IMintTransactionDataJson, MintTransactionData } from '../transaction/MintTransactionData.js';
import { ITransactionJson, Transaction } from '../transaction/Transaction.js';
import { ITransactionDataJson, TransactionData } from '../transaction/TransactionData.js';
import { TokenCoinData, TokenCoinDataJson } from './fungible/TokenCoinData.js';

/** Current serialization version for tokens. */
export const TOKEN_VERSION = '2.0';

/**
 * JSON representation of a {@link Token}.
 */
export interface ITokenJson {
  readonly version: string;
  readonly id: string;
  readonly type: string;
  readonly data: unknown;
  readonly coins: TokenCoinDataJson | null;
  readonly state: ITokenStateJson;
  readonly transactions: [ITransactionJson<IMintTransactionDataJson>, ...ITransactionJson<ITransactionDataJson>[]];
  readonly nametagTokens: ITokenJson[];
}

/**
 * In-memory representation of a token including its transaction history.
 */
export class Token<TD extends ISerializable, MTD extends MintTransactionData<ISerializable | null>> {
  /**
   * Create a new token instance.
   * @param id Token identifier
   * @param type Token type
   * @param data Token immutable data object
   * @param coins Fungible coin balances associated with this token, or null if none
   * @param state Current state of the token including state data and unlock predicate
   * @param _transactions History of transactions starting with the mint transaction
   * @param _nametagTokens List of nametag tokens associated with this token
   * @param version Serialization version of the token, defaults to {@link TOKEN_VERSION}
   */
  public constructor(
    public readonly id: TokenId,
    public readonly type: TokenType,
    public readonly data: TD,
    public readonly coins: TokenCoinData | null,
    public readonly state: TokenState,
    private readonly _transactions: [Transaction<MTD>, ...Transaction<TransactionData>[]],
    private readonly _nametagTokens: NameTagToken[] = [],
    public readonly version: string = TOKEN_VERSION,
  ) {
    this._nametagTokens = [..._nametagTokens];
    this._transactions = [..._transactions];
  }

  /** Nametag tokens associated with this token. */
  public get nametagTokens(): NameTagToken[] {
    return [...this._nametagTokens];
  }

  /** History of all transactions starting with the mint transaction. */
  public get transactions(): [Transaction<MTD>, ...Transaction<TransactionData>[]] {
    return [...this._transactions];
  }

  /** Serialize this token to JSON. */
  public toJSON(): ITokenJson {
    return {
      coins: this.coins?.toJSON() ?? null,
      data: this.data.toJSON(),
      id: this.id.toJSON(),
      nametagTokens: this.nametagTokens.map((token) => token.toJSON()),
      state: this.state.toJSON(),
      transactions: this.transactions.map((transaction) => transaction.toJSON()) as [
        ITransactionJson<IMintTransactionDataJson>,
        ...ITransactionJson<ITransactionDataJson>[],
      ],
      type: this.type.toJSON(),
      version: this.version,
    };
  }

  /** Serialize this token to CBOR. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      this.id.toCBOR(),
      this.type.toCBOR(),
      this.data.toCBOR(),
      this.coins?.toCBOR() ?? CborEncoder.encodeNull(),
      this.state.toCBOR(),
      CborEncoder.encodeArray(this.transactions.map((transaction) => transaction.toCBOR())),
      CborEncoder.encodeArray(this.nametagTokens.map((token) => token.toCBOR())),
      CborEncoder.encodeTextString(this.version),
    ]);
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
        Token[${this.version}]:
          Id: ${this.id.toString()}
          Type: ${this.type.toString()}
          Data: 
            ${this.data.toString()}
          Coins:
            ${this.coins?.toString() ?? null}
          State:
            ${this.state.toString()}
          Transactions: [
            ${this.transactions.map((transition) => transition.toString()).join('\n')}
          ]
          Nametag Tokens: [ 
            ${this.nametagTokens.map((token) => token.toString()).join('\n')}
          ]
      `;
  }
}
