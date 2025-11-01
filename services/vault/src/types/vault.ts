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
  status:
    | "Available"
    | "Pending"
    | "In Use"
    | "Signing required"
    | "Ready to Sign"
    | "Processing"
    | "Verified"
    | "Pending Bitcoin Confirmations"
    | "Expired";
}
