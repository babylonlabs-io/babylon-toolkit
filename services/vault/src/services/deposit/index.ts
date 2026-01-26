/**
 * Deposit Service Layer
 *
 * Pure functions for deposit-related operations.
 * No side effects, no state management.
 */

export * from "./transformers";
export * from "./validations";

import * as transformers from "./transformers";
import * as validations from "./validations";

export const depositService = {
  ...validations,
  ...transformers,
};
