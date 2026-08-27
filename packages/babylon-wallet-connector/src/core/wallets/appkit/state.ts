import type { createAppKit } from "@reown/appkit/react";
import type { Chain } from "viem";
import type { Config } from "wagmi";

import { ERROR_CODES, WalletError } from "@/error";

import type { SharedBtcAppKitConfig } from "../btc/appkit/sharedConfig";

export type AppKitModal = ReturnType<typeof createAppKit>;

interface AppKitMetadata {
  name: string;
  description: string;
  url: string;
  icons: readonly string[];
}

export interface AppKitCapabilities {
  readonly projectId: string;
  readonly metadataFingerprint: string;
  readonly ethFingerprint?: string;
  readonly btcNetwork?: "mainnet" | "signet";
}

export interface AppKitState extends AppKitCapabilities {
  readonly modal: AppKitModal;
  readonly wagmiConfig?: Config;
  readonly btcConfig?: SharedBtcAppKitConfig;
}

const configFunctionIds = new WeakMap<object, number>();
let nextConfigFunctionId = 1;

function getConfigFunctionId(value: object): number {
  const existingId = configFunctionIds.get(value);
  if (existingId) return existingId;

  const id = nextConfigFunctionId++;
  configFunctionIds.set(value, id);
  return id;
}

function createConfigFingerprint(value: object): string {
  const fingerprint = JSON.stringify(value, (_key, nestedValue) => {
    if (typeof nestedValue === "bigint") {
      return { type: "bigint", value: nestedValue.toString() };
    }

    if (typeof nestedValue === "function") {
      return { type: "function", value: getConfigFunctionId(nestedValue) };
    }

    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      return Object.fromEntries(
        Object.entries(nestedValue).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
      );
    }

    return nestedValue;
  });

  if (fingerprint === undefined) {
    throw new TypeError("AppKit configuration cannot be serialized.");
  }

  return fingerprint;
}

export function createAppKitCapabilities({
  projectId,
  metadata,
  ethChain,
  btcNetwork,
}: {
  projectId: string;
  metadata: AppKitMetadata;
  ethChain?: Chain;
  btcNetwork?: "mainnet" | "signet";
}): AppKitCapabilities {
  return Object.freeze({
    projectId,
    metadataFingerprint: createConfigFingerprint(metadata),
    ethFingerprint: ethChain ? createConfigFingerprint(ethChain) : undefined,
    btcNetwork,
  });
}

/**
 * AppKit allows one modal instance per page. The instance is held here rather
 * than in either initializer so the unified (ETH+BTC) and Ethereum-only setups
 * observe the same singleton without the Ethereum-only one having to import
 * the Bitcoin adapter through its sibling.
 */
let appKitState: AppKitState | null = null;
const manualAppKitCapabilities = new Set<"Ethereum" | "Bitcoin">();

function failInitialization(message: string, chainId?: string): never {
  throw new WalletError({ code: ERROR_CODES.WALLET_INITIALIZATION_FAILED, message, chainId });
}

export function getAppKitState(): AppKitState | null {
  return appKitState;
}

export function getAppKitModal(): AppKitModal | null {
  return appKitState?.modal ?? null;
}

export function registerManualAppKitConfig(capability: "Ethereum" | "Bitcoin"): void {
  if (appKitState) {
    failInitialization(
      `Cannot set a manual ${capability} AppKit configuration after AppKit initialization. Use the canonical AppKit state.`,
    );
  }

  manualAppKitCapabilities.add(capability);
}

/** @internal */
export function __resetManualAppKitConfigForTests(capability: "Ethereum" | "Bitcoin"): void {
  manualAppKitCapabilities.delete(capability);
}

export function validateAppKitInitialization(projectId?: string): projectId is string {
  if (!projectId) {
    if (appKitState) {
      failInitialization(
        "AppKit is already initialized. A project ID is required to validate the requested configuration.",
      );
    }

    return false;
  }

  if (manualAppKitCapabilities.size > 0) {
    failInitialization(
      `Cannot initialize AppKit after a manual ${[...manualAppKitCapabilities].join(" and ")} configuration was set. Use only one initialization method.`,
    );
  }

  return true;
}

export function setAppKitState(state: AppKitState): AppKitState {
  if (appKitState) {
    failInitialization("AppKit is already initialized. Reuse the shared AppKit state instead of replacing it.");
  }

  if (manualAppKitCapabilities.size > 0) {
    failInitialization("Cannot publish AppKit state after a manual shared configuration was set.");
  }

  appKitState = Object.freeze({ ...state, btcConfig: state.btcConfig ? Object.freeze({ ...state.btcConfig }) : undefined });
  return appKitState;
}

export function assertAppKitCapabilities(existing: AppKitCapabilities, requested: AppKitCapabilities): void {
  if (existing.projectId !== requested.projectId) {
    failInitialization(
      "AppKit was already initialized with a different project ID. A page can use only one AppKit configuration.",
    );
  }

  if (existing.metadataFingerprint !== requested.metadataFingerprint) {
    failInitialization(
      "AppKit was already initialized with different metadata. A page can use only one AppKit configuration.",
    );
  }

  if (requested.ethFingerprint) {
    if (!existing.ethFingerprint) {
      failInitialization(
        "AppKit was already initialized without Ethereum support. A page that needs Ethereum must initialize AppKit with Ethereum first.",
        "ETH",
      );
    }

    if (existing.ethFingerprint !== requested.ethFingerprint) {
      failInitialization("AppKit was already initialized with a different Ethereum chain configuration.", "ETH");
    }
  }

  if (requested.btcNetwork) {
    if (!existing.btcNetwork) {
      failInitialization(
        "AppKit was already initialized without Bitcoin support. A page that needs Bitcoin must initialize AppKit with Bitcoin first.",
        "BTC",
      );
    }

    if (existing.btcNetwork !== requested.btcNetwork) {
      failInitialization("AppKit was already initialized with a different Bitcoin network.", "BTC");
    }
  }
}
