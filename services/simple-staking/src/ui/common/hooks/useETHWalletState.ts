import { useEffect, useReducer, useRef } from "react";
import { useAccount } from "wagmi";

type WalletState =
    | "INITIALIZING"
    | "CONNECTING"
    | "AWAITING_ADDRESS"
    | "CONNECTED"
    | "DISCONNECTED"
    | "ERROR";

interface WalletStateData {
    state: WalletState;
    address: string | undefined;
    chainId: number | undefined;
    isReady: boolean;
    error?: string;
}

type WalletAction =
    | { type: "INIT_START" }
    | { type: "CONNECTION_DETECTED"; address?: string; chainId?: number }
    | { type: "ADDRESS_RECEIVED"; address: string; chainId?: number }
    | { type: "DISCONNECTED" }
    | { type: "ERROR"; error: string }
    | { type: "RESET" };
function walletStateReducer(state: WalletStateData, action: WalletAction): WalletStateData {
    let newState: WalletStateData;

    switch (action.type) {
        case "INIT_START":
            newState = { ...state, state: "INITIALIZING", isReady: false };
            break;

        case "CONNECTION_DETECTED":
            if (action.address) {
                newState = {
                    state: "CONNECTED",
                    address: action.address,
                    chainId: action.chainId,
                    isReady: true,
                    error: undefined,
                };
            } else {
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

    useEffect(() => {
        currentStatusRef.current = status;
    }, [status]);
    useEffect(() => {
        const handleStateUpdate = () => {
            previousStatusRef.current = status;

            switch (status) {
                case "disconnected":
                    const timeSinceMount = Date.now() - mountTimeRef.current;
                    const GRACE_PERIOD = 3000;
                    const isWithinGracePeriod = timeSinceMount < GRACE_PERIOD;

                    if (!isWithinGracePeriod || hasSeenConnectedRef.current || initCompleteRef.current) {
                        if (!hasSeenConnectedRef.current) {
                            dispatch({ type: "DISCONNECTED" });
                            initCompleteRef.current = true;
                        } else {
                            dispatch({ type: "DISCONNECTED" });
                            initCompleteRef.current = true;
                        }
                    }
                    break;

                case "connecting":
                case "reconnecting":
                    hasSeenConnectedRef.current = false;
                    if (!initCompleteRef.current) {
                        dispatch({ type: "INIT_START" });
                    }
                    break;

                case "connected":
                    hasSeenConnectedRef.current = true;

                    if (address) {
                        dispatch({ type: "CONNECTION_DETECTED", address, chainId });
                        initCompleteRef.current = true;
                    } else {
                        dispatch({ type: "CONNECTION_DETECTED", chainId });
                    }
                    break;
            }
        };

        handleStateUpdate();
    }, [status, address, chainId]);

    useEffect(() => {
        if (walletState.state === "AWAITING_ADDRESS" && address) {
            dispatch({ type: "ADDRESS_RECEIVED", address, chainId });
            initCompleteRef.current = true;
        }
    }, [walletState.state, address, chainId]);

    useEffect(() => {
        const GRACE_PERIOD = 3000;
        const timer = setTimeout(() => {
            const latestStatus = currentStatusRef.current;
            if (!initCompleteRef.current && !hasSeenConnectedRef.current) {
                if (latestStatus === "disconnected") {
                    dispatch({ type: "DISCONNECTED" });
                    initCompleteRef.current = true;
                }
            }
        }, GRACE_PERIOD);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!initCompleteRef.current) {
            const timer = setTimeout(() => {
                if (!initCompleteRef.current) {
                    if (status === "connected" && !address) {
                        dispatch({ type: "DISCONNECTED" });
                    } else if (status === "disconnected") {
                        dispatch({ type: "DISCONNECTED" });
                    } else if (walletState.state === "INITIALIZING") {
                        dispatch({ type: "DISCONNECTED" });
                    }
                    initCompleteRef.current = true;
                }
            }, 5000);

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
        isConnected: walletState.state === "CONNECTED",
        isLoading: walletState.state === "INITIALIZING" ||
            walletState.state === "CONNECTING" ||
            walletState.state === "AWAITING_ADDRESS",
    };

    return result;
}
