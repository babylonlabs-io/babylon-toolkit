// Types for ETH data structures
export interface ETHTypedData {
    domain: {
        name?: string;
        version?: string;
        chainId?: number | string;
        verifyingContract?: string;
        salt?: string;
    };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, any>;
}
