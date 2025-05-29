import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { TokenId } from './TokenId.js';
import { ITokenStateJson, TokenState } from './TokenState.js';
import { TokenType } from './TokenType.js';
import { ISerializable } from '../ISerializable.js';
import { NameTagToken } from './NameTagToken.js';
import { IMintTransactionDataJson, MintTransactionData } from '../transaction/MintTransactionData.js';
import { ITransactionDto, Transaction } from '../transaction/Transaction.js';
import { ITransactionDataDto, TransactionData } from '../transaction/TransactionData.js';
import { TokenCoinData, TokenCoinDataJson } from './fungible/TokenCoinData.js';

export const TOKEN_VERSION = '2.0';

export interface ITokenJson {
  readonly version: string;
  readonly id: string;
  readonly type: string;
  readonly data: unknown;
  readonly coins: TokenCoinDataJson | null;
  readonly state: ITokenStateJson;
  readonly transactions: [ITransactionDto<IMintTransactionDataJson>, ...ITransactionDto<ITransactionDataDto>[]];
  readonly nametagTokens: ITokenJson[];
}

export class Token<TD extends ISerializable, MTD extends MintTransactionData<ISerializable | null>> {
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

  public get nametagTokens(): NameTagToken[] {
    return [...this._nametagTokens];
  }

  public get transactions(): [Transaction<MTD>, ...Transaction<TransactionData>[]] {
    return [...this._transactions];
  }

  public toJSON(): ITokenJson {
    return {
      coins: this.coins?.toJSON() ?? null,
      data: this.data.toJSON(),
      id: this.id.toJSON(),
      nametagTokens: this.nametagTokens.map((token) => token.toJSON()),
      state: this.state.toJSON(),
      transactions: this.transactions.map((transaction) => transaction.toJSON()) as [
        ITransactionDto<IMintTransactionDataJson>,
        ...ITransactionDto<ITransactionDataDto>[],
      ],
      type: this.type.toJSON(),
      version: this.version,
    };
  }

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
