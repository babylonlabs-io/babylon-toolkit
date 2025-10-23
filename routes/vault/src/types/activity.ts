export interface Activity {
  id: string;
  date: string;
  type: "Deposit" | "Withdraw" | "Borrow" | "Repay";
  amount: string;
  transactionHash: string;
}

/**
 * Vault activity representing a pegin/deposit with its status
 * Used to display deposit activities in the vault interface
 */
export interface VaultActivity {
  id: string;
  amount: string;
  status: 'Available' | 'Pending' | 'In Use' | 'Expired';
  providers: Array<{ id: string }>;
  date: string;
}

