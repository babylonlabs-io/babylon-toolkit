export interface GeoFencingContextType {
  isGeoBlocked: boolean;
  isLoading: boolean;
  /**
   * Whether the geofence check determined the visitor's region. False while
   * it runs, when the health endpoint did not answer, and when a blocking
   * configuration error stopped the checks before it. In each case
   * `isGeoBlocked` is false without the region being known.
   */
  isGeoChecked: boolean;
}
