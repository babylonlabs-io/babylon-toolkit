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
    name: string;
    icon: string;
  };
  status: PeginDisplayLabel;
}
