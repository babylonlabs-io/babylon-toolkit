/**
 * Activity service for fetching aggregated user activities across applications
 *
 * This service provides a unified interface for fetching activity logs from
 * all enabled applications (Aave, etc.)
 *
 * TODO: Replace mock data with real data fetching
 */

import type { Address } from "viem";

import type { ActivityLog } from "../../types/activityLog";

/**
 * Mock activities data matching the design specification
 * Uses realistic data for Aave application activities
 */
const MOCK_ACTIVITIES: ActivityLog[] = [
  {
    id: "activity-1",
    date: new Date("2025-10-16T12:17:22"),
    application: {
      id: "aave",
      name: "Aave",
      logoUrl: "/images/aave.svg",
    },
    type: "Repay",
    amount: {
      value: "15,180.32",
      symbol: "USDC",
      icon: "https://assets.coingecko.com/coins/images/6319/standard/usdc.png",
    },
    transactionHash:
      "0xb2c3d4e5a1b2c3d4e5f6g7h8i9j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9",
  },
  {
    id: "activity-2",
    date: new Date("2025-10-16T12:17:22"),
    application: {
      id: "aave",
      name: "Aave",
      logoUrl: "/images/aave.svg",
    },
    type: "Borrow",
    amount: {
      value: "15,180.32",
      symbol: "USDC",
      icon: "https://assets.coingecko.com/coins/images/6319/standard/usdc.png",
    },
    transactionHash:
      "0xb2c3d4e5a1b2c3d4e5f6g7h8i9j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9",
  },
  {
    id: "activity-3",
    date: new Date("2025-10-16T11:48:47"),
    application: {
      id: "aave",
      name: "Aave",
      logoUrl: "/images/aave.svg",
    },
    type: "Deposit",
    amount: {
      value: "0.25",
      symbol: "BTC",
      icon: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png",
    },
    transactionHash:
      "0xa1b2c3d4e5f6g7h8i9j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3",
  },
  {
    id: "activity-4",
    date: new Date("2025-10-16T11:48:47"),
    application: {
      id: "aave",
      name: "Aave",
      logoUrl: "/images/aave.svg",
    },
    type: "Deposit",
    amount: {
      value: "1",
      symbol: "BTC",
      icon: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png",
    },
    transactionHash:
      "0xa1b2c3d4e5f6g7h8i9j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3",
  },
  {
    id: "activity-5",
    date: new Date("2025-10-16T11:48:47"),
    application: {
      id: "aave",
      name: "Aave",
      logoUrl: "/images/aave.svg",
    },
    type: "Deposit",
    amount: {
      value: "0.5",
      symbol: "BTC",
      icon: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png",
    },
    transactionHash:
      "0xa1b2c3d4e5f6g7h8i9j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3",
  },
  {
    id: "activity-6",
    date: new Date("2025-10-16T11:48:47"),
    application: {
      id: "aave",
      name: "Aave",
      logoUrl: "/images/aave.svg",
    },
    type: "Deposit",
    amount: {
      value: "0.25",
      symbol: "BTC",
      icon: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png",
    },
    transactionHash:
      "0xa1b2c3d4e5f6g7h8i9j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3",
  },
];

/**
 * Fetch user activities across all enabled applications
 *
 * @param _address - User's wallet address (unused in mock implementation)
 * @returns Promise resolving to array of activity logs sorted by date (newest first)
 *
 * TODO: Implement real data fetching:
 * 1. Query contract events for each application
 * 2. Aggregate and normalize activity data
 * 3. Sort by timestamp
 */
export async function fetchUserActivities(
  _address: Address,
): Promise<ActivityLog[]> {
  // TODO: Use _address to fetch real activity data
  void _address;
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Return mock data sorted by date descending
  return [...MOCK_ACTIVITIES].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
}

export const ACTIVITIES_QUERY_KEY = "user-activities";
