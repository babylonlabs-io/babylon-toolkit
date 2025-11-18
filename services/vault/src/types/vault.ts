import type { PeginDisplayLabel } from "../models/peginStateMachine";

export interface VaultData {
  supplyTVL: number;
  borrowTVL: number;
  protocolLTV: number;
  btc: number;
}

export interface Deposit {
  id: string;
  amount: number;
  vaultProvider: {
    address: string;
  };
  pegInTxHash: string;
  status: PeginDisplayLabel;
}
