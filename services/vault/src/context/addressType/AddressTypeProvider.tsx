import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";

import { useBTCWallet } from "@/context/wallet";
import { btcAddressToScriptPubKeyHex } from "@/utils/btc";

import type { AddressTypeContextType } from "./types";

/** `OP_1 OP_PUSHBYTES_32` as returned by `btcAddressToScriptPubKeyHex`: the P2TR scriptPubKey prefix. */
const P2TR_SCRIPT_PREFIX = "0x5120";

const AddressTypeContext = createContext<AddressTypeContextType>({
  isSupportedAddress: true,
  isCheckingAddress: false,
});

/**
 * Checks that a BTC address decodes, for the configured network, to a P2TR
 * scriptPubKey. Decoding verifies the checksum, length and network prefix.
 */
function isTaprootAddress(address: string): boolean {
  try {
    return btcAddressToScriptPubKeyHex(address).startsWith(P2TR_SCRIPT_PREFIX);
  } catch {
    return false;
  }
}

export function AddressTypeProvider({ children }: PropsWithChildren) {
  const { connected, address } = useBTCWallet();

  const value = useMemo<AddressTypeContextType>(() => {
    // If not connected, we consider it supported (no restriction yet)
    if (!connected || !address) {
      return {
        isSupportedAddress: true,
        isCheckingAddress: false,
      };
    }

    // Check if the connected address is Taproot
    const isTaproot = isTaprootAddress(address);

    return {
      isSupportedAddress: isTaproot,
      isCheckingAddress: false,
    };
  }, [connected, address]);

  return (
    <AddressTypeContext.Provider value={value}>
      {children}
    </AddressTypeContext.Provider>
  );
}

export const useAddressType = () => useContext(AddressTypeContext);
