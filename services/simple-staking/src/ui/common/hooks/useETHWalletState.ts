import { useEffect, useReducer, useRef } from "react";
import { useAccount } from "wagmi";

// State machine states
type WalletState =
    | "INITIALIZING"  // Initial state, determining connection status
    | "CONNECTING"    // Actively connecting
    | "AWAITING_ADDRESS" // Connected but waiting for address
    | "CONNECTED"     // Fully connected with address
    | "DISCONNECTED"  // Not connected
    | "ERROR";        // Error state

interface WalletStateData {
    state: WalletState;
    address: string | undefined;
    chainId: number | undefined;
    isReady: boolean; // True when we can safely determine connection status
    error?: string;
}

// Actions for state transitions
type WalletAction =
    | { type: "INIT_START" }
    | { type: "CONNECTION_DETECTED"; address?: string; chainId?: number }
    | { type: "ADDRESS_RECEIVED"; address: string; chainId?: number }
    | { type: "DISCONNECTED" }
    | { type: "ERROR"; error: string }
    | { type: "RESET" };

// State machine reducer
function walletStateReducer(state: WalletStateData, action: WalletAction): WalletStateData {
    let newState: WalletStateData;

    switch (action.type) {
        case "INIT_START":
            newState = { ...state, state: "INITIALIZING", isReady: false };
            break;

        case "CONNECTION_DETECTED":
            if (action.address) {
                // We have both connection and address - fully connected
                newState = {
                    state: "CONNECTED",
                    address: action.address,
                    chainId: action.chainId,
                    isReady: true,
                    error: undefined,
                };
            } else {
                // Connected but no address yet
                newState = {
                    ...state,
                    state: "AWAITING_ADDRESS",
                    chainId: action.chainId,
                    isReady: false,
                };
            }
            break;

        case "ADDRESS_RECEIVED":
            newState = {
                state: "CONNECTED",
                address: action.address,
                chainId: action.chainId,
                isReady: true,
                error: undefined,
            };
            break;

        case "DISCONNECTED":
            newState = {
                state: "DISCONNECTED",
                address: undefined,
                chainId: undefined,
                isReady: true,
                error: undefined,
            };
            break;

        case "ERROR":
            newState = {
                ...state,
                state: "ERROR",
                isReady: true,
                error: action.error,
            };
            break;

        case "RESET":
            newState = initialState;
            break;

        default:
            newState = state;
    }

    return newState;
}

const initialState: WalletStateData = {
    state: "INITIALIZING",
    address: undefined,
    chainId: undefined,
    isReady: false,
    error: undefined,
};

export function useETHWalletState() {
    const [walletState, dispatch] = useReducer(walletStateReducer, initialState);
    const { status, address, chainId } = useAccount();
    const previousStatusRef = useRef<string>();
    const initCompleteRef = useRef(false);
    const mountTimeRef = useRef(Date.now());
    const hasSeenConnectedRef = useRef(false);
    const currentStatusRef = useRef(status);


    // Keep currentStatusRef up to date
    useEffect(() => {
        currentStatusRef.current = status;
    }, [status]);

    // Main effect to manage state transitions based on wagmi account changes
    useEffect(() => {
        const handleStateUpdate = () => {
            // Track status changes to detect transitions
            previousStatusRef.current = status;

            // Handle different wagmi statuses
            switch (status) {
                case "disconnected":
                    // CRITICAL FIX: Don't immediately go to disconnected on mount
                    // Give wagmi MORE time to reconnect from localStorage
                    const timeSinceMount = Date.now() - mountTimeRef.current;
                    const GRACE_PERIOD = 3000; // Increase to 3 seconds for slower reconnections
                    const isWithinGracePeriod = timeSinceMount < GRACE_PERIOD;

                    if (!isWithinGracePeriod || hasSeenConnectedRef.current || initCompleteRef.current) {
                        if (!hasSeenConnectedRef.current) {
                            // Grace period ended and we never saw a connection
                            dispatch({ type: "DISCONNECTED" });
                            initCompleteRef.current = true;
                        } else {
                            // We've seen a connection before, so this is a real disconnect
                            dispatch({ type: "DISCONNECTED" });
                            initCompleteRef.current = true;
                        }
                    }
                    break;

                case "connecting":
                case "reconnecting":
                    hasSeenConnectedRef.current = false; // Reset this flag when reconnecting
                    // Still in transition, don't update ready state
                    if (!initCompleteRef.current) {
                        dispatch({ type: "INIT_START" });
                    }
                    break;

                case "connected":
                    // This is the critical part - we're connected
                    hasSeenConnectedRef.current = true; // Mark that we've seen a connected status

                    if (address) {
                        // We have everything we need
                        dispatch({ type: "CONNECTION_DETECTED", address, chainId });
                        initCompleteRef.current = true;
                    } else {
                        // Connected but no address yet - this is the race condition scenario
                        // We'll wait for the address to appear
                        dispatch({ type: "CONNECTION_DETECTED", chainId });
                    }
                    break;
            }
        };

        handleStateUpdate();
    }, [status, address, chainId]);

    // Separate effect to handle address updates when in AWAITING_ADDRESS state
    useEffect(() => {
        if (walletState.state === "AWAITING_ADDRESS" && address) {
            dispatch({ type: "ADDRESS_RECEIVED", address, chainId });
            initCompleteRef.current = true;
        }
    }, [walletState.state, address, chainId]);

    // Backup grace period timer - ensures we eventually resolve the state
    // This only runs ONCE on mount to avoid timer reset issues
    useEffect(() => {
        const GRACE_PERIOD = 3000; // Match the grace period in the main effect
        const timer = setTimeout(() => {
            // Check currentStatusRef for the latest status value
            const latestStatus = currentStatusRef.current;
            if (!initCompleteRef.current && !hasSeenConnectedRef.current) {
                // If we're still not initialized after grace period,
                // force a state resolution based on current status
                if (latestStatus === "disconnected") {
                    dispatch({ type: "DISCONNECTED" });
                    initCompleteRef.current = true;
                }
                // Note: If still connecting/reconnecting, we'll rely on the failsafe timeout
            }
        }, GRACE_PERIOD);

        return () => clearTimeout(timer);
    }, []); // Empty deps - only run once on mount

    // Failsafe mechanism - but with better handling
    useEffect(() => {
        if (!initCompleteRef.current) {

            // After 5 seconds (increased from 3), if we're still not initialized, check our state
            const timer = setTimeout(() => {
                if (!initCompleteRef.current) {
                    // Force to disconnected if we can't determine state
                    if (status === "connected" && !address) {
                        // This shouldn't happen, but if it does, treat as disconnected
                        dispatch({ type: "DISCONNECTED" });
                    } else if (status === "disconnected") {
                        // Still disconnected after 5 seconds - no wallet to reconnect
                        dispatch({ type: "DISCONNECTED" });
                    } else if (walletState.state === "INITIALIZING") {
                        // Stuck in INITIALIZING for too long
                        dispatch({ type: "DISCONNECTED" });
                    }
                    initCompleteRef.current = true;
                }
            }, 5000); // Increased to 5 seconds to give more time for reconnection

            return () => {
                clearTimeout(timer);
            };
        }
    }, [status, address, walletState.state]);

    const result = {
        state: walletState.state,
        address: walletState.address,
        chainId: walletState.chainId,
        isReady: walletState.isReady,
        error: walletState.error,

        // Computed convenience properties
        isConnected: walletState.state === "CONNECTED",
        isLoading: walletState.state === "INITIALIZING" ||
            walletState.state === "CONNECTING" ||
            walletState.state === "AWAITING_ADDRESS",
    };

    return result;
}
