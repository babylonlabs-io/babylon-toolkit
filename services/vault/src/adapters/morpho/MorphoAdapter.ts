import type { Address, Chain, WalletClient } from "viem";

import { Morpho, MorphoOracle } from "../../clients/eth-contract";
import { CONTRACTS } from "../../config/contracts";
import {
  fetchMorphoMarkets,
  type MorphoMarket,
} from "../../services/applications/morpho";
import {
  getUserPositionForMarket as getMorphoUserPositionForMarket,
  getUserPositionsWithMorpho,
  type PositionWithMorpho,
} from "../../services/position";
import {
  addCollateralWithMarketId,
  borrowMoreFromPosition,
  repayDebtFull,
  repayDebtPartial,
  withdrawAllCollateralFromPosition,
} from "../../services/position/positionTransactionService";
import type {
  ApplicationConfig,
  BorrowParams,
  DepositCollateralParams,
  IApplicationAdapter,
  Market,
  Position,
  RepayParams,
  TransactionResult,
  VaultForBorrowing,
  WithdrawParams,
} from "../types";

const MORPHO_CONFIG: ApplicationConfig = {
  id: "morpho",
  name: "Morpho",
  type: "Lending",
  description:
    "Morpho is a lending protocol that optimizes interest rates by matching lenders and borrowers peer-to-peer while maintaining the liquidity of underlying pools.",
  logoUrl:
    "https://assets.coingecko.com/coins/images/31915/standard/morpho.png",
  websiteUrl: "https://morpho.org",
  contracts: {
    MORPHO: CONTRACTS.MORPHO,
    MORPHO_CONTROLLER: CONTRACTS.MORPHO_CONTROLLER,
  },
};

export class MorphoAdapter implements IApplicationAdapter {
  readonly id = "morpho";
  readonly config: ApplicationConfig = MORPHO_CONFIG;

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async getMarkets(): Promise<Market[]> {
    const { markets } = await fetchMorphoMarkets();
    return markets.map((m) => this.transformMarket(m));
  }

  async getMarketById(marketId: string): Promise<Market | null> {
    const markets = await this.getMarkets();
    return markets.find((m) => m.id === marketId) ?? null;
  }

  async getMarketBorrowRate(marketId: string): Promise<number> {
    const marketData = await Morpho.getMarketWithData(marketId);
    return marketData.utilizationPercent * 0.1;
  }

  async getUserPositions(userAddress: Address): Promise<Position[]> {
    const positions = await getUserPositionsWithMorpho(
      userAddress,
      CONTRACTS.MORPHO_CONTROLLER,
    );

    return positions
      .filter(
        (p) =>
          p.morphoPosition.borrowShares > 0n ||
          p.morphoPosition.collateral > 0n,
      )
      .map((p) => this.transformPosition(p, userAddress));
  }

  async getUserPositionForMarket(
    userAddress: Address,
    marketId: string,
  ): Promise<Position | null> {
    const position = await getMorphoUserPositionForMarket(
      userAddress,
      marketId,
      CONTRACTS.MORPHO_CONTROLLER,
    );

    if (!position) return null;

    return {
      id: position.positionId,
      marketId: position.marketId,
      applicationId: this.id,
      userAddress,
      collateral: position.currentCollateral,
      debt: position.currentLoan,
      vaultIds: [],
      metadata: {},
    };
  }

  async getVaultsAvailableForBorrowing(): Promise<VaultForBorrowing[]> {
    return [];
  }

  async depositCollateral(
    walletClient: WalletClient,
    chain: Chain,
    params: DepositCollateralParams,
  ): Promise<TransactionResult> {
    const result = await addCollateralWithMarketId(
      walletClient,
      chain,
      CONTRACTS.MORPHO_CONTROLLER,
      params.vaultIds,
      params.marketId,
    );

    return {
      hash: result.transactionHash,
      wait: async () => ({
        status: result.receipt.status === "success" ? "success" : "reverted",
      }),
    };
  }

  async borrow(
    walletClient: WalletClient,
    chain: Chain,
    params: BorrowParams,
  ): Promise<TransactionResult> {
    if (params.vaultIds && params.vaultIds.length > 0) {
      const result = await addCollateralWithMarketId(
        walletClient,
        chain,
        CONTRACTS.MORPHO_CONTROLLER,
        params.vaultIds,
        params.marketId,
        params.amount,
      );

      return {
        hash: result.transactionHash,
        wait: async () => ({
          status: result.receipt.status === "success" ? "success" : "reverted",
        }),
      };
    }

    const result = await borrowMoreFromPosition(
      walletClient,
      chain,
      CONTRACTS.MORPHO_CONTROLLER,
      params.marketId,
      params.amount,
    );

    return {
      hash: result.transactionHash,
      wait: async () => ({
        status: result.receipt.status === "success" ? "success" : "reverted",
      }),
    };
  }

  async repay(
    walletClient: WalletClient,
    chain: Chain,
    params: RepayParams,
  ): Promise<TransactionResult> {
    const userAddress = walletClient.account?.address;
    if (!userAddress) {
      throw new Error("Wallet address not available");
    }

    const position = await this.getUserPositionForMarket(
      userAddress,
      params.marketId,
    );
    if (!position) {
      throw new Error("Position not found");
    }

    if (params.isFullRepay) {
      const result = await repayDebtFull(
        walletClient,
        chain,
        CONTRACTS.MORPHO_CONTROLLER,
        position.id,
        params.marketId,
      );

      return {
        hash: result.transactionHash,
        wait: async () => ({
          status: result.receipt.status === "success" ? "success" : "reverted",
        }),
      };
    }

    const result = await repayDebtPartial(
      walletClient,
      chain,
      CONTRACTS.MORPHO_CONTROLLER,
      position.id,
      params.marketId,
      params.amount,
    );

    return {
      hash: result.transactionHash,
      wait: async () => ({
        status: result.receipt.status === "success" ? "success" : "reverted",
      }),
    };
  }

  async withdrawCollateral(
    walletClient: WalletClient,
    chain: Chain,
    params: WithdrawParams,
  ): Promise<TransactionResult> {
    const result = await withdrawAllCollateralFromPosition(
      walletClient,
      chain,
      CONTRACTS.MORPHO_CONTROLLER,
      params.marketId,
    );

    return {
      hash: result.transactionHash,
      wait: async () => ({
        status: result.receipt.status === "success" ? "success" : "reverted",
      }),
    };
  }

  async getCollateralPriceUSD(marketId: string): Promise<number> {
    const market = await this.getMarketById(marketId);
    if (!market) throw new Error(`Market not found: ${marketId}`);

    const oracleAddress = market.metadata.oracleAddress as Address;
    const price = await MorphoOracle.getOraclePrice(oracleAddress);
    return MorphoOracle.convertOraclePriceToUSD(price);
  }

  private transformMarket(m: MorphoMarket): Market {
    return {
      id: m.id,
      applicationId: this.id,
      collateralToken: {
        address: m.collateralTokenAddress as Address,
        symbol: m.collateralToken?.symbol ?? "???",
        name: m.collateralToken?.name ?? "Unknown",
        decimals: m.collateralToken?.decimals ?? 8,
      },
      loanToken: {
        address: m.loanTokenAddress as Address,
        symbol: m.loanToken?.symbol ?? "???",
        name: m.loanToken?.name ?? "Unknown",
        decimals: m.loanToken?.decimals ?? 6,
      },
      totalSupply: 0n,
      totalBorrow: 0n,
      utilizationRate: 0,
      borrowRate: 0,
      liquidationLTV: Number(m.lltv) / 1e16,
      createdAt: m.createdAt,
      metadata: {
        oracleAddress: m.oracleAddress,
        irm: m.irm,
        lltv: m.lltv,
        blockNumber: m.blockNumber,
        transactionHash: m.transactionHash,
      },
    };
  }

  private transformPosition(
    p: PositionWithMorpho,
    userAddress: Address,
  ): Position {
    return {
      id: p.positionId,
      marketId: p.position.marketId,
      applicationId: this.id,
      userAddress,
      collateral: p.morphoPosition.collateral,
      debt: p.morphoPosition.borrowAssets,
      vaultIds: p.position.vaultIds,
      metadata: {
        proxyContract: p.position.proxyContract,
        borrowShares: p.morphoPosition.borrowShares,
        btcPriceUSD: p.btcPriceUSD,
      },
    };
  }
}
