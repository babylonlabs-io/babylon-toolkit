export interface Activity {
  id: string;
  date: string;
  type: "Deposit" | "Withdraw" | "Borrow" | "Repay";
  amount: string;
  transactionHash: string;
}

