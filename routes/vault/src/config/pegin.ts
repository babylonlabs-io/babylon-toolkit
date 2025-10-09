/**
 * Peg-in Configuration for Local Development
 *
 * IMPORTANT: These values are HARDCODED for local Anvil testnet.
 * In production, these would be fetched.
 */

import type { Address } from 'viem';

export const LOCAL_PEGIN_CONFIG = {
  /**
   * HARDCODED: Local vault provider from btc-vault-deployment
   * This is the third Anvil account used as vault provider in local setup
   */
  vaultProviderAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,

  /**
   * HARDCODED: Vault provider's BTC public key (x-only, 32 bytes)
   * From btc-vault-deployment config: VP_BTC_PUBKEY
   */
  vaultProviderBtcPubkey:
    'e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13',

  /**
   * HARDCODED: Local liquidators (challengers) BTC public keys
   * These are the two liquidators configured in btc-vault-deployment
   * From: LIQUIDATOR_1_BTC_PUBKEY and LIQUIDATOR_2_BTC_PUBKEY
   */
  liquidatorBtcPubkeys: [
    '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', // Liquidator 1
    'c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5', // Liquidator 2
  ],

  /**
   * HARDCODED: Network for local development
   */
  network: 'regtest' as const,

  /**
   * HARDCODED: Estimated fee for BTC transaction
   */
  btcTransactionFee: 10_000n,
};
