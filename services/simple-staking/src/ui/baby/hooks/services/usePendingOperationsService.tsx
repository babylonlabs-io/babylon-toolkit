import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { useLogger } from "@/ui/common/hooks/useLogger";
import {
  getBabyEpochData,
  getCurrentEpoch,
  setBabyEpochData,
  type PendingOperationStorage,
  BABY_EPOCH_UPDATED_EVENT,
  BABY_PENDING_OPERATIONS_UPDATED_EVENT,
} from "@/ui/baby/utils/epochStorage";

/**
 * Runtime representation of a pending BABY staking operation.
 * Uses bigint for amount to support arbitrary precision arithmetic.
 */
export interface PendingOperation {
  validatorAddress: string;
  amount: bigint;
  operationType: "stake" | "unstake";
  timestamp: number;
  walletAddress: string;
  epoch: number;
}

/**
 * Clean up old version pending operations from localStorage.
 * This is called once on mount to remove stale data from previous versions.
 */
const cleanupOldVersions = () => {
  try {
    const prefix = `baby-pending-operations-`;
    const epochPrefix = `baby-current-epoch-`;

    Object.keys(localStorage)
      .filter(
        (key) =>
          key.startsWith(prefix) ||
          (key.startsWith(epochPrefix) && !key.includes("baby-epoch-data")),
      )
      .forEach((key) => {
        localStorage.removeItem(key);
      });
  } catch (error) {
    // Silently fail if localStorage is not available
    console.warn("[BABY] Failed to cleanup old pending operations:", error);
  }
};

// Create the context
const PendingOperationsContext = createContext<ReturnType<
  typeof usePendingOperationsServiceInternal
> | null>(null);

// Internal hook that contains the actual logic
function usePendingOperationsServiceInternal() {
  const logger = useLogger();
  const { bech32Address } = useCosmosWallet();

  // Read epoch from localStorage (updated by useEpochPolling in layout)
  const [epoch, setEpoch] = useState<number | undefined>(() =>
    getCurrentEpoch(),
  );

  const [pendingOperations, setPendingOperations] = useState<
    PendingOperation[]
  >(() => {
    if (!bech32Address) return [];

    try {
      const epochData = getBabyEpochData();
      if (!epochData) return [];

      const walletOperations = epochData.pendingOperations[bech32Address];
      if (!walletOperations) return [];

      const parsedStorage: PendingOperationStorage[] = walletOperations;
      return parsedStorage.map((item) => ({
        ...item,
        amount: BigInt(item.amount),
      }));
    } catch {
      logger.warn("Error getting pending operations from localStorage", {
        tags: {
          bech32Address,
          app: "baby",
        },
      });
      return [];
    }
  });

  // Sync epoch state with localStorage (updated by useEpochPolling)
  useEffect(() => {
    const syncEpoch = () => {
      const currentEpoch = getCurrentEpoch();
      setEpoch(currentEpoch);
    };

    // Listen for epoch updates from useEpochPolling
    window.addEventListener("storage", syncEpoch);
    window.addEventListener(BABY_EPOCH_UPDATED_EVENT, syncEpoch);

    return () => {
      window.removeEventListener("storage", syncEpoch);
      window.removeEventListener(BABY_EPOCH_UPDATED_EVENT, syncEpoch);
    };
  }, []);

  // Reset pending operations when wallet address changes
  useEffect(() => {
    if (!bech32Address) {
      setPendingOperations([]);
      return;
    }

    try {
      const epochData = getBabyEpochData();
      if (!epochData) {
        setPendingOperations([]);
        return;
      }

      const walletOperations = epochData.pendingOperations[bech32Address];
      if (walletOperations) {
        const parsedStorage: PendingOperationStorage[] = walletOperations;
        const operations = parsedStorage.map((item) => ({
          ...item,
          amount: BigInt(item.amount),
        }));
        setPendingOperations(operations);
      } else {
        setPendingOperations([]);
      }
    } catch {
      setPendingOperations([]);
    }
  }, [bech32Address]);

  // Persist pending operations to localStorage within the unified epoch data structure
  useEffect(() => {
    if (!bech32Address) return;

    const storageFormat: PendingOperationStorage[] = pendingOperations.map(
      (item) => ({
        ...item,
        amount: item.amount.toString(),
      }),
    );

    const epochData = getBabyEpochData();
    if (epochData) {
      // Update only this wallet's pending operations
      const updatedData = {
        ...epochData,
        pendingOperations: {
          ...epochData.pendingOperations,
          [bech32Address]: storageFormat,
        },
      };
      setBabyEpochData(updatedData);
    } else {
      // If no epoch data exists yet, create it with current epoch (or undefined)
      const currentEpoch = getCurrentEpoch();
      if (currentEpoch !== undefined) {
        setBabyEpochData({
          epoch: currentEpoch,
          pendingOperations: {
            [bech32Address]: storageFormat,
          },
        });
      }
    }

    // Emit custom event for same-tab updates (storage event only fires for other tabs)
    window.dispatchEvent(new Event(BABY_PENDING_OPERATIONS_UPDATED_EVENT));
  }, [pendingOperations, bech32Address]);

  const addPendingOperation = useCallback(
    (
      validatorAddress: string,
      amount: bigint,
      operationType: "stake" | "unstake",
    ) => {
      if (!bech32Address) return;

      const operationEpoch = getCurrentEpoch();
      // If epoch isn't ready, silently return - UI should prevent this
      if (operationEpoch === undefined) return;

      setPendingOperations((prev) => {
        // Find existing operation for this validator and operation type
        const existingOperation = prev.find(
          (op) =>
            op.validatorAddress === validatorAddress &&
            op.operationType === operationType,
        );

        if (existingOperation) {
          // Accumulate amounts for the same validator and operation type
          const updatedOperation: PendingOperation = {
            ...existingOperation,
            amount: existingOperation.amount + amount,
            timestamp: Date.now(), // Update timestamp to latest
          };

          const newState = prev.map((op) =>
            op.validatorAddress === validatorAddress &&
            op.operationType === operationType
              ? updatedOperation
              : op,
          );
          return newState;
        } else {
          // Create new operation with validated epoch
          const pendingOperation: PendingOperation = {
            validatorAddress,
            amount,
            operationType,
            timestamp: Date.now(),
            walletAddress: bech32Address,
            epoch: operationEpoch,
          };

          return [...prev, pendingOperation];
        }
      });
    },
    [bech32Address],
  );

  const removePendingOperation = useCallback((validatorAddress: string) => {
    setPendingOperations((prev) =>
      prev.filter((op) => op.validatorAddress !== validatorAddress),
    );
  }, []);

  const clearAllPendingOperations = useCallback(() => {
    setPendingOperations([]);
  }, []);

  // Cleanup function called when epoch changes
  // With unified storage, this just clears the in-memory state
  // The actual cleanup happens automatically in setCurrentEpoch()
  const cleanupAllPendingOperationsFromStorage = useCallback(() => {
    try {
      // Clear in-memory state for current wallet
      // The localStorage is already cleared by setCurrentEpoch() when epoch changes
      setPendingOperations([]);
    } catch (error) {
      console.error("[BABY] Error during pending operations cleanup:", error);
    }
  }, []);

  const getPendingOperations = useCallback(() => {
    return pendingOperations;
  }, [pendingOperations]);

  const getPendingOperationsByValidator = useCallback(
    (validatorAddress: string) => {
      return pendingOperations.filter(
        (op) => op.validatorAddress === validatorAddress,
      );
    },
    [pendingOperations],
  );

  const getPendingStake = useCallback(
    (validatorAddress: string) => {
      return pendingOperations.find(
        (op) =>
          op.validatorAddress === validatorAddress &&
          op.operationType === "stake",
      );
    },
    [pendingOperations],
  );

  const getPendingUnstake = useCallback(
    (validatorAddress: string) => {
      return pendingOperations.find(
        (op) =>
          op.validatorAddress === validatorAddress &&
          op.operationType === "unstake",
      );
    },
    [pendingOperations],
  );

  // Calculate total pending stake across all validators
  const getTotalPendingStake = useCallback(() => {
    return pendingOperations
      .filter((op) => op.operationType === "stake")
      .reduce((total, op) => total + op.amount, 0n);
  }, [pendingOperations]);

  // Calculate total pending unstake across all validators
  const getTotalPendingUnstake = useCallback(() => {
    return pendingOperations
      .filter((op) => op.operationType === "unstake")
      .reduce((total, op) => total + op.amount, 0n);
  }, [pendingOperations]);

  // Calculate total pending operations (stake + unstake)
  const getTotalPendingOperations = useCallback(() => {
    return getTotalPendingStake() + getTotalPendingUnstake();
  }, [getTotalPendingStake, getTotalPendingUnstake]);

  // Check if epoch is ready for staking operations
  const isEpochReady = epoch !== undefined;

  return {
    pendingOperations,
    addPendingOperation,
    removePendingOperation,
    clearAllPendingOperations,
    cleanupAllPendingOperationsFromStorage,
    getPendingOperations,
    getPendingOperationsByValidator,
    getPendingStake,
    getPendingUnstake,
    getTotalPendingStake,
    getTotalPendingUnstake,
    getTotalPendingOperations,
    isEpochReady,
  };
}

// Public hook that uses the context
export function usePendingOperationsService() {
  const context = useContext(PendingOperationsContext);
  if (!context) {
    throw new Error(
      "usePendingOperationsService must be used within a PendingOperationsProvider",
    );
  }
  return context;
}

// Provider component
export function PendingOperationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const service = usePendingOperationsServiceInternal();

  // Clean up old version pending operations on mount
  useEffect(() => {
    cleanupOldVersions();
  }, []);

  return (
    <PendingOperationsContext.Provider value={service}>
      {children}
    </PendingOperationsContext.Provider>
  );
}
