export interface AddressScreeningContextType {
  /** True if either the BTC or ETH address was screened as high-risk. */
  isBlocked: boolean;
  /** True while the initial screening for the currently connected addresses is in flight. */
  isLoading: boolean;
}
