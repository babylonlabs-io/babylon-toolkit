/**
 * Vault Provider Service
 *
 * Re-exports provider fetching functions from the providers service.
 * Uses GraphQL-based ponder indexer for data.
 */

export {
  fetchActiveProviders,
  fetchProviders,
} from "../providers/fetchProviders";
