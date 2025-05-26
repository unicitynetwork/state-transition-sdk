import { AddressScheme } from './AddressScheme.js';

export interface IAddress {
  readonly scheme: AddressScheme;

  toJSON(): string;
}
