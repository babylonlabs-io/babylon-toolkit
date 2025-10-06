// TO BE REMOVED: TEMPORARY MOCK DATA FOR VAULT ACTIVITIES

// Activity type for vault positions
export interface VaultActivity {
  id: string;
  collateral: {
    amount: string;
    symbol: string;
    icon?: string;
  };
  status: {
    label: string;
    variant: "active" | "inactive" | "pending" | "default";
  };
  providers: Array<{
    id: string;
    name: string;
    icon?: string;
  }>;
  action: {
    label: string;
    onClick: () => void;
  };
  // Morpho position data
  morphoPosition?: {
    collateral: bigint;
    borrowShares: bigint;
    borrowed: bigint;
  };
  // Enriched borrowing data (calculated from morpho position + market data)
  borrowingData?: {
    borrowedAmount: string; // Formatted borrowed amount in loan token (e.g., "1000.50 USDC")
    borrowedSymbol: string; // Symbol of borrowed token (e.g., "USDC")
    currentLTV: number; // Current LTV percentage (e.g., 50.5 = 50.5%)
    maxLTV: number; // Maximum LTV (LLTV) percentage from market (e.g., 80 = 80%)
  };
  // Market data for borrowing (BTC price and LLTV)
  marketData?: {
    btcPriceUSD: number; // BTC price in USD (e.g., 100000 = $100,000)
    lltvPercent: number; // Liquidation LTV percentage from market (e.g., 80 = 80%)
  };
  // Position created date
  positionDate?: Date;
  // Transaction hash for fetching vault data
  txHash?: string;
}

const bitcoinIconDataUri = "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%23FF7C2A' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z'/%3E%3C/svg%3E";

// Mock vault activities data
export const mockVaultActivities: VaultActivity[] = [
  {
    id: "1",
    collateral: {
      amount: "5",
      symbol: "BTC",
      icon: bitcoinIconDataUri
    },
    status: {
      label: "Active",
      variant: "active"
    },
    providers: [
      { 
        id: "provider-1", 
        name: "Ironclad BTC",
        icon: undefined
      },
      { 
        id: "provider-2", 
        name: "Atlas Custody",
        icon: undefined
      }
    ],
    action: {
      label: "Borrow USDC",
      onClick: () => console.log("Borrow USDC for activity 1")
    }
  },
  {
    id: "2",
    collateral: {
      amount: "2.5",
      symbol: "BTC",
      icon: bitcoinIconDataUri
    },
    status: {
      label: "Pending",
      variant: "pending"
    },
    providers: [
      { 
        id: "provider-3", 
        name: "Morpho Vault",
        icon: undefined
      }
    ],
    action: {
      label: "Borrow USDC",
      onClick: () => console.log("Borrow USDC for activity 2")
    }
  },
  {
    id: "3",
    collateral: {
      amount: "10",
      symbol: "BTC",
      icon: bitcoinIconDataUri
    },
    status: {
      label: "Inactive",
      variant: "inactive"
    },
    providers: [
      { 
        id: "provider-1", 
        name: "Ironclad BTC",
        icon: undefined
      },
      { 
        id: "provider-4", 
        name: "Genesis Vault",
        icon: undefined
      }
    ],
    action: {
      label: "Borrow USDC",
      onClick: () => console.log("Borrow USDC for activity 3")
    }
  }
];
