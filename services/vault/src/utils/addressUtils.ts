/**
 * Utility functions for address formatting and manipulation
 */

import type { Address } from "viem";

/**
 * Truncates an Ethereum address to show first 6 and last 4 characters
 * Example: 0x1234567890abcdef... -> 0x1234...cdef
 */
export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Converts a string to an Ethereum Address type.
 * Ensures the string starts with '0x' prefix.
 *
 * @param value - String to convert to Address
 * @returns The value as an Address type
 * @throws Error if value is empty
 */
export function toAddress(value: string): Address {
  if (!value) {
    throw new Error("Address cannot be empty");
  }
  const prefixed = value.startsWith("0x") ? value : `0x${value}`;
  return prefixed as Address;
}
