/**
 * Deposit Service Layer
 * 
 * Pure functions for deposit-related operations.
 * No side effects, no state management, just pure transformations and calculations.
 */

// Export all calculation functions
export * from './calculations';

// Export all validation functions
export * from './validations';

// Export all transformer functions  
export * from './transformers';

// Aggregate service object for convenient imports
import * as calculations from './calculations';
import * as validations from './validations';
import * as transformers from './transformers';

export const depositService = {
  ...calculations,
  ...validations,
  ...transformers
};
