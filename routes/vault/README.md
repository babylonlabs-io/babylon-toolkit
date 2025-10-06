# Vault Application

Vault application for managing BTC staking and ETH interactions under the `/vault` URL path.

## File Structure

```
routes/vault/src/
├── VaultLayout.tsx               # Main layout component with wallet connection
├── index.ts
├── clients/                      # External API and service clients
│   ├── eth-contract/             # ETH smart contract client for querying data and constructing transactions
│   │   ├── btc-vaults-manager/   # BTCVaultsManager contract interactions
│   │   ├── vault-controller/     # VaultController contract interactions
│   │   ├── morpho/               # Morpho protocol interactions
│   │   └── index.ts
│   ├── morpho-graphql/           # GraphQL client for fetching market, position, and LLTV information from Morpho
│   │   └── index.ts
│   ├── vault-api/                # API client for fetching vault list by ETH address from vault-api service
│   │   └── index.ts
│   └── vault-provider/           # RPC-based client for vault provider - querying and posting data
│       └── index.ts
├── components/                   # React components
│   ├── ui/                       # UI components for vault application
│   │   ├── Borrow.tsx           # Main borrow interface with activity cards
│   │   └── index.ts
│   ├── modals/                   # Modal components for user actions
│   └── examples/                 # Example/test components
├── config/                       # Configuration files
│   ├── contracts.ts              # Smart contract addresses
│   └── index.ts
├── hooks/                        # Custom React hooks for vault operations
│   ├── usePeginRequests.ts      # Hook for fetching vault data from blockchain
│   └── index.ts
├── services/                     # Business logic layer orchestrating clients and transactions
│   └── index.ts
├── state/                        # State management for vault application data
│   └── index.ts
├── storage/                      # Local storage utilities for persisting intermediate state (e.g., pending transactions, user preferences)
│   └── index.ts
├── transactions/                 # Transaction construction logic for BTC and ETH
│   ├── index.ts
│   ├── btc/                      # BTC transaction construction for pegIn, claim, and payout operations
│   │   └── index.ts
│   └── eth/                      # ETH transaction construction for smart contract interactions
│       └── index.ts
├── types/                        # TypeScript type definitions for vault, morpho, and transaction data
│   └── index.ts
└── utils/                        # Utility functions for formatting, validation, and helpers
    ├── peginTransformers.ts      # Transform blockchain data to UI format
    └── index.ts
```