import { createRPCClient } from "@babylonlabs-io/babylon-proto-ts";
import { QueryClient } from "@cosmjs/stargate";
import { CometClient, connectComet } from "@cosmjs/tendermint-rpc";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { ClientError, ERROR_CODES } from "@/ui/common/errors";

type RPCClient = Awaited<ReturnType<typeof createRPCClient>>;

interface BbnRpcContextType {
  queryClient: QueryClient | undefined;
  tmClient: CometClient | undefined;
  rpcClient: RPCClient | undefined;
  isLoading: boolean;
  error: Error | null;
  reconnect: () => Promise<void>;
}

const BbnRpcContext = createContext<BbnRpcContextType>({
  queryClient: undefined,
  tmClient: undefined,
  rpcClient: undefined,
  isLoading: true,
  error: null,
  reconnect: async () => {},
});

export function BbnRpcProvider({ children }: { children: React.ReactNode }) {
  const [queryClient, setQueryClient] = useState<QueryClient>();
  const [tmClient, setTmClient] = useState<CometClient>();
  const [rpcClient, setRpcClient] = useState<RPCClient>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { rpc } = getNetworkConfigBBN();

  const connect = useCallback(async () => {
    try {
      const tmClientInstance = await connectComet(rpc);
      const client = QueryClient.withExtensions(tmClientInstance);
      const rpcClientInstance = await createRPCClient({ url: rpc });
      setQueryClient(client);
      setTmClient(tmClientInstance);
      setRpcClient(rpcClientInstance);
      setIsLoading(false);
      setError(null);
    } catch (err) {
      const clientError = new ClientError(
        ERROR_CODES.EXTERNAL_SERVICE_UNAVAILABLE,
        "Failed to connect RPC Provider",
        { cause: err as Error },
      );
      setError(clientError);
      setIsLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (mounted) {
        await connect();
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [connect]);

  const reconnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    await connect();
  }, [connect]);

  return (
    <BbnRpcContext.Provider
      value={{
        queryClient,
        tmClient,
        rpcClient,
        isLoading,
        error,
        reconnect,
      }}
    >
      {children}
    </BbnRpcContext.Provider>
  );
}

export const useBbnRpc = () => useContext(BbnRpcContext);
