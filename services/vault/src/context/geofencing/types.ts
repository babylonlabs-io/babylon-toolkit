export interface GeoFencingContextType {
  isGeoBlocked: boolean;
  isLoading: boolean;
  /**
   * Whether the geofence check ran. False while it runs, and when a blocking
   * configuration error stopped the checks before it, in which case
   * `isGeoBlocked` is false without the visitor's region being known.
   */
  isGeoChecked: boolean;
}
