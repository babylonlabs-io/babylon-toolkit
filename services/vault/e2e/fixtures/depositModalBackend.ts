/**
 * Deterministic backend for the deposit modal (#1592).
 *
 * The deposit modal sits behind two blocking React context providers:
 *   - `ProtocolParamsProvider` waits on 3 multicall eth_calls
 *   - `AaveConfigProvider` waits on GraphQL + an on-chain core-spoke
 *     address read
 *
 * Mocking the underlying RPC + GraphQL responses end-to-end would
 * require ABI-encoded multicall payloads (real signing-grade work).
 * Instead this fixture sets `window.__BABYLON_E2E_PROTOCOL_PARAMS__`
 * and `window.__BABYLON_E2E_AAVE_CONFIG__` - small e2e escape hatches
 * the production providers read in `NEXT_PUBLIC_E2E_MODE` (gated; the
 * branch is unreachable in production builds).
 *
 * On top of that this helper registers a GraphQL handler that returns
 * the seeded vault-provider list from `GetAppProviders`, so the deposit
 * form's provider-select hydrates from a deterministic fixture rather
 * than the indexer.
 */

import type { Page } from "@playwright/test";

import { mockGraphql } from "./networkRoutes";

const E2E_AAVE_ADAPTER = "0x0000000000000000000000000000000000000002";
const E2E_VAULT_BTC_ADDRESS = "0x0000000000000000000000000000000000000010";
const E2E_BTC_VAULT_REGISTRY = "0x0000000000000000000000000000000000000001";
const E2E_CORE_SPOKE = "0x0000000000000000000000000000000000000020";
const E2E_VBTC_RESERVE_ID = "1";
const E2E_VBTC_UNDERLYING = "0x0000000000000000000000000000000000000030";
const E2E_VBTC_HUB = "0x0000000000000000000000000000000000000040";

export interface ProviderSeed {
  /** Ethereum address (lowercase) - the registry id of the VP. */
  id: string;
  /** 0x-prefixed 33-byte compressed BTC pubkey (66 hex). */
  btcPubKey: string;
  /** Display name shown in the picker. */
  name: string;
  rpcUrl?: string;
  metadataStatus?: string;
  metadataRejectionReason?: string | null;
}

export interface DepositModalBackendOptions {
  providers: ProviderSeed[];
  /**
   * Optional adapter address override. Must match
   * `NEXT_PUBLIC_TBV_AAVE_ADAPTER` in `playwright.config.ts` because
   * the dApp asserts the indexer value equals the env-pinned address
   * before trusting it.
   */
  aaveAdapter?: string;
  /** Optional VP commission floor in bps. Default 0. */
  minVpCommissionBps?: number;
}

/**
 * Install the deposit-modal backend mocks. Must be called BEFORE
 * `page.goto(...)` so the e2e overrides are present when React's
 * context providers first run.
 */
export async function installDepositModalBackend(
  page: Page,
  options: DepositModalBackendOptions,
): Promise<void> {
  await mockGraphql(page, (op) => {
    if (
      op.query.includes("vaultProviders") &&
      op.query.includes("applicationEntryPoint")
    ) {
      return {
        data: {
          vaultProviders: {
            items: options.providers.map((p) => ({
              id: p.id,
              btcPubKey: p.btcPubKey,
              name: p.name,
              rpcUrl: p.rpcUrl ?? "https://vp.test/rpc",
              metadataStatus: p.metadataStatus ?? "ok",
              metadataRejectionReason: p.metadataRejectionReason ?? null,
            })),
          },
          vaultKeeperApplications: { items: [] },
        },
      };
    }
    // Health-check probe + any other unrelated query: just acknowledge.
    return { data: { __typename: "Query" } };
  });

  const adapter = options.aaveAdapter ?? E2E_AAVE_ADAPTER;
  const minVpBps = options.minVpCommissionBps ?? 0;

  await page.addInitScript(
    ({
      adapter,
      vaultBtc,
      registry,
      coreSpoke,
      vbtcReserveId,
      vbtcUnderlying,
      vbtcHub,
      minVpBps,
    }) => {
      // ProtocolParams override. The shape mirrors the SDK's
      // VersionedOffchainParams / PegInConfiguration / ProtocolParamsContextValue
      // exactly. Fields the deposit form reads:
      //   - offchainParams.councilQuorum
      //   - offchainParams.securityCouncilKeys.length
      //   - offchainParams.feeRate
      //   - minimumPegInAmount, maxPegInAmount (for slider bounds)
      const minSats = 50_000n;
      const maxSats = 500_000_000n;
      const offchain = {
        timelockAssert: 144n,
        timelockChallengeAssert: 72n,
        securityCouncilKeys: [
          `0x02${"33".repeat(32)}`,
          `0x02${"44".repeat(32)}`,
          `0x02${"55".repeat(32)}`,
        ],
        councilQuorum: 2,
        feeRate: 5n,
        babeTotalInstances: 1,
        babeInstancesToFinalize: 1,
        minVpCommissionBps: minVpBps,
        tRefund: 288,
        tStale: 144,
        minPeginFeeRate: 1n,
        proverProgramVersion: 1,
        minPrepeginDepth: 6,
      };
      const pegin = {
        minimumPegInAmount: minSats,
        maxPegInAmount: maxSats,
        pegInAckTimeout: 86_400n,
        pegInActivationTimeout: 86_400n,
        maxHtlcOutputCount: 16,
        timelockPegin: 144,
        timelockRefund: 288,
        minVpCommissionBps: minVpBps,
        offchainParams: offchain,
        offchainParamsVersion: 1,
      };
      (
        window as unknown as { __BABYLON_E2E_PROTOCOL_PARAMS__: unknown }
      ).__BABYLON_E2E_PROTOCOL_PARAMS__ = {
        config: pegin,
        minDeposit: minSats,
        maxDeposit: maxSats,
        timelockPegin: 144,
        timelockRefund: 288,
        minVpCommissionBps: minVpBps,
        latestUniversalChallengers: [],
        getUniversalChallengersByVersion: () => [],
        getOffchainParamsByVersion: (v: number) =>
          v === 1 ? offchain : undefined,
      };

      // AaveConfig override.
      (
        window as unknown as { __BABYLON_E2E_AAVE_CONFIG__: unknown }
      ).__BABYLON_E2E_AAVE_CONFIG__ = {
        config: {
          adapterAddress: adapter,
          vaultBtcAddress: vaultBtc,
          btcVaultRegistryAddress: registry,
          coreSpokeAddress: coreSpoke,
          btcVaultCoreVbtcReserveId: BigInt(vbtcReserveId),
        },
        vbtcReserve: {
          reserveId: BigInt(vbtcReserveId),
          reserve: {
            underlying: vbtcUnderlying,
            hub: vbtcHub,
            assetId: 0,
            decimals: 8,
            dynamicConfigKey: 0,
            paused: false,
            frozen: false,
            borrowable: false,
            collateralRisk: 0,
            collateralFactor: 8000,
          },
          token: {
            address: vbtcUnderlying,
            symbol: "vBTC",
            name: "Vault BTC",
            decimals: 8,
          },
        },
        borrowableReserves: [],
        allBorrowReserves: [],
      };
    },
    {
      adapter,
      vaultBtc: E2E_VAULT_BTC_ADDRESS,
      registry: E2E_BTC_VAULT_REGISTRY,
      coreSpoke: E2E_CORE_SPOKE,
      vbtcReserveId: E2E_VBTC_RESERVE_ID,
      vbtcUnderlying: E2E_VBTC_UNDERLYING,
      vbtcHub: E2E_VBTC_HUB,
      minVpBps,
    },
  );
}
