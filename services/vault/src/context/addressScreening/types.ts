export interface AddressScreeningContextType {
  /** True if either address was screened as high-risk or could not be screened. */
  isBlocked: boolean;
  /** True if the block comes only from a failed screening request, not from a high-risk result. */
  isUnavailable: boolean;
  /** True while the initial screening for the currently connected addresses is in flight. */
  isLoading: boolean;
}
