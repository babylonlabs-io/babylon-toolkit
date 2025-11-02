/**
 * Data Transfer Objects for Deposit operations.
 * These DTOs are used for communication between layers.
 */

/**
 * DTO for creating a new deposit.
 */
export interface CreateDepositDTO {
  vaultId: string;
  depositorEthAddress: string;
  depositorBtcAddress: string;
  amountSat: bigint;
  providerIds: string[];
  btcTransactionId?: string;
  ethTransactionHash?: string;
}

/**
 * DTO representing a deposit.
 */
export interface DepositDTO {
  id: string;
  vaultId: string;
  depositorEthAddress: string;
  depositorBtcAddress: string;
  amountSat: bigint;
  amountBtc: number;
  providers: VaultProviderDTO[];
  status: string;
  confirmations: number;
  requiredConfirmations: number;
  canRedeem: boolean;
  btcTransactionId?: string;
  ethTransactionHash?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * DTO for vault provider information.
 */
export interface VaultProviderDTO {
  id: string;
  btcPublicKey: string;
  name: string;
  description?: string;
}

/**
 * DTO for redeeming deposits.
 */
export interface RedeemDepositDTO {
  depositIds: string[];
  depositorEthAddress: string;
  signature?: string;
}

/**
 * DTO for deposit list filters.
 */
export interface DepositFilterDTO {
  depositorAddress?: string;
  vaultId?: string;
  status?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * DTO for paginated deposit results.
 */
export interface PaginatedDepositsDTO {
  deposits: DepositDTO[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
