import { type Address, type Hex } from 'viem';

export interface ManagerPeginRequest {
  depositor: Address;
  txHash: Hex;
  amount: bigint;
  status: number; // enum PeginStatus
}

export interface ManagerPeginRequestFull extends ManagerPeginRequest {
  unsignedBtcTx?: Hex;
  vaultProvider?: Address;
}

