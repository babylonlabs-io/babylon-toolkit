/**
 * Tests for deposit validation functions
 */

import { describe, it, expect } from 'vitest';
import {
  validateDepositAmount,
  validateSufficientBalance,
  validateUTXOs,
  validateProviderSelection,
  validateDepositParameters,
  validateBtcAddress,
  type DepositValidationParams,
} from '../validations';
import type { UTXO } from '../../vault/vaultTransactionService';

describe('Deposit Validations', () => {
  describe('validateDepositAmount', () => {
    const minDeposit = 10000n; // 0.0001 BTC
    const maxDeposit = 21000000_00000000n; // 21M BTC

    it('should accept valid deposit amount', () => {
      const result = validateDepositAmount(100000n, minDeposit, maxDeposit);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject zero amount', () => {
      const result = validateDepositAmount(0n, minDeposit, maxDeposit);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than zero');
    });

    it('should reject negative amount', () => {
      const result = validateDepositAmount(-1000n, minDeposit, maxDeposit);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than zero');
    });

    it('should reject amount below minimum', () => {
      const result = validateDepositAmount(5000n, minDeposit, maxDeposit);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Minimum deposit');
    });

    it('should reject amount above maximum', () => {
      const tooMuch = maxDeposit + 1n;
      const result = validateDepositAmount(tooMuch, minDeposit, maxDeposit);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Maximum deposit');
    });

    it('should accept exact minimum amount', () => {
      const result = validateDepositAmount(minDeposit, minDeposit, maxDeposit);
      
      expect(result.valid).toBe(true);
    });

    it('should accept exact maximum amount', () => {
      const result = validateDepositAmount(maxDeposit, minDeposit, maxDeposit);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('validateSufficientBalance', () => {
    it('should accept sufficient balance', () => {
      const result = validateSufficientBalance(100000n, 200000n);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject insufficient balance', () => {
      const result = validateSufficientBalance(100000n, 50000n);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient balance');
      expect(result.error).toContain('50000'); // Shows shortage amount
    });

    it('should accept exact balance', () => {
      const result = validateSufficientBalance(100000n, 100000n);
      
      expect(result.valid).toBe(true);
    });

    it('should handle zero required amount', () => {
      const result = validateSufficientBalance(0n, 100000n);
      
      expect(result.valid).toBe(true);
    });

    it('should handle zero balance with non-zero required', () => {
      const result = validateSufficientBalance(100000n, 0n);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('100000');
    });
  });

  describe('validateUTXOs', () => {
    const validUTXOs: UTXO[] = [
      { txid: '0x123', vout: 0, value: 50000, scriptPubKey: '0xabc' },
      { txid: '0x456', vout: 1, value: 100000, scriptPubKey: '0xdef' },
    ];

    it('should accept valid UTXOs with sufficient value', () => {
      const result = validateUTXOs(validUTXOs, 100000n);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty UTXO array', () => {
      const result = validateUTXOs([], 100000n);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No UTXOs available');
    });

    it('should reject null/undefined UTXOs', () => {
      const result = validateUTXOs(null as any, 100000n);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No UTXOs available');
    });

    it('should reject invalid UTXOs (missing txid)', () => {
      const invalidUTXOs: UTXO[] = [
        { txid: '', vout: 0, value: 50000, scriptPubKey: '0xabc' },
      ];
      
      const result = validateUTXOs(invalidUTXOs, 10000n);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid UTXOs');
    });

    it('should reject invalid UTXOs (invalid vout)', () => {
      const invalidUTXOs: UTXO[] = [
        { txid: '0x123', vout: undefined as any, value: 50000, scriptPubKey: '0xabc' },
      ];
      
      const result = validateUTXOs(invalidUTXOs, 10000n);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid UTXOs');
    });

    it('should reject invalid UTXOs (zero or negative value)', () => {
      const invalidUTXOs: UTXO[] = [
        { txid: '0x123', vout: 0, value: 0, scriptPubKey: '0xabc' },
        { txid: '0x456', vout: 1, value: -100, scriptPubKey: '0xdef' },
      ];
      
      const result = validateUTXOs(invalidUTXOs, 10000n);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid UTXOs');
    });

    it('should reject insufficient UTXO value', () => {
      const result = validateUTXOs(validUTXOs, 200000n); // Total is 150000
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain("don't have sufficient value");
    });

    it('should warn about too many UTXOs', () => {
      const manyUTXOs: UTXO[] = Array.from({ length: 15 }, (_, i) => ({
        txid: `0x${i}`,
        vout: i,
        value: 10000,
        scriptPubKey: `0x${i}`,
      }));
      
      const result = validateUTXOs(manyUTXOs, 50000n);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('increase transaction fees');
    });
  });

  describe('validateProviderSelection', () => {
    const availableProviders = [
      '0x1234567890abcdef1234567890abcdef12345678',
      '0xabcdef1234567890abcdef1234567890abcdef12',
      '0x9876543210fedcba9876543210fedcba98765432',
    ];

    it('should accept valid single provider', () => {
      const result = validateProviderSelection(
        [availableProviders[0]], 
        availableProviders
      );
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty provider selection', () => {
      const result = validateProviderSelection([], availableProviders);
      
      expect(result.valid).toBe(false);
      expect(result.error?.toLowerCase()).toContain('at least one');
    });

    it('should reject null/undefined providers', () => {
      const result = validateProviderSelection(
        null as any, 
        availableProviders
      );
      
      expect(result.valid).toBe(false);
      expect(result.error?.toLowerCase()).toContain('at least one');
    });

    it('should reject invalid provider', () => {
      const result = validateProviderSelection(
        ['0xinvalid'], 
        availableProviders
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid vault provider');
    });

    it('should reject multiple providers (not yet supported)', () => {
      const result = validateProviderSelection(
        [availableProviders[0], availableProviders[1]], 
        availableProviders
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Multiple providers not yet supported');
    });

    it('should handle empty available providers list', () => {
      const result = validateProviderSelection(['0x123'], []);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid vault provider');
    });
  });

  describe('validateDepositParameters', () => {
    const validParams: DepositValidationParams = {
      amount: 100000n,
      btcBalance: 200000n,
      minDeposit: 10000n,
      maxDeposit: 21000000_00000000n,
      utxos: [
        { txid: '0x123', vout: 0, value: 100000, scriptPubKey: '0xabc' },
        { txid: '0x456', vout: 1, value: 100000, scriptPubKey: '0xdef' },
      ],
    };

    it('should accept valid parameters', () => {
      const result = validateDepositParameters(validParams);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should fail on invalid amount', () => {
      const params = { ...validParams, amount: 5000n }; // Below minimum
      const result = validateDepositParameters(params);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Minimum deposit');
    });

    it('should fail on insufficient balance', () => {
      const params = { ...validParams, btcBalance: 50000n };
      const result = validateDepositParameters(params);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });

    it('should fail on invalid UTXOs', () => {
      const params = { ...validParams, utxos: [] };
      const result = validateDepositParameters(params);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No UTXOs available');
    });

    it('should combine warnings from multiple validations', () => {
      const manyUTXOs: UTXO[] = Array.from({ length: 15 }, (_, i) => ({
        txid: `0x${i}`,
        vout: i,
        value: 10000,
        scriptPubKey: `0x${i}`,
      }));
      
      const params = { ...validParams, utxos: manyUTXOs };
      const result = validateDepositParameters(params);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });
  });

  describe('validateBtcAddress', () => {
    describe('mainnet', () => {
      it('should accept valid P2TR address', () => {
        const result = validateBtcAddress(
          'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
          'mainnet'
        );
        
        expect(result.valid).toBe(true);
      });

      it('should accept valid P2WPKH address', () => {
        const result = validateBtcAddress(
          'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
          'mainnet'
        );
        
        expect(result.valid).toBe(true);
      });

      it('should accept valid legacy P2PKH address', () => {
        const result = validateBtcAddress(
          '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          'mainnet'
        );
        
        expect(result.valid).toBe(true);
      });

      it('should accept valid P2SH address', () => {
        const result = validateBtcAddress(
          '3FnJZwDXDLD8jFwJ9bj1Qe5KBzN8ZV8Zxq',
          'mainnet'
        );
        
        expect(result.valid).toBe(true);
      });

      it('should reject testnet address on mainnet', () => {
        const result = validateBtcAddress(
          'tb1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
          'mainnet'
        );
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid mainnet');
      });
    });

    describe('testnet', () => {
      it('should accept valid testnet P2TR address', () => {
        const result = validateBtcAddress(
          'tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47zagq',
          'testnet'
        );
        
        expect(result.valid).toBe(true);
      });

      it('should accept valid testnet P2WPKH address', () => {
        const result = validateBtcAddress(
          'tb1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
          'testnet'
        );
        
        expect(result.valid).toBe(true);
      });

      it('should accept valid testnet legacy addresses', () => {
        const result1 = validateBtcAddress(
          'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
          'testnet'
        );
        const result2 = validateBtcAddress(
          'n2ZkZLChjKmPpL1pJXnJzK9cJqvF4nrBTp',
          'testnet'
        );
        
        expect(result1.valid).toBe(true);
        expect(result2.valid).toBe(true);
      });

      it('should reject mainnet address on testnet', () => {
        const result = validateBtcAddress(
          'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
          'testnet'
        );
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid testnet');
      });
    });

    describe('general validation', () => {
      it('should reject empty address', () => {
        const result = validateBtcAddress('', 'mainnet');
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject too short address', () => {
        const result = validateBtcAddress('bc1tooshort', 'mainnet');
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain('too short');
      });

      it('should accept addresses with valid prefix and length (basic validation)', () => {
        // Note: Current implementation only validates prefix and length
        // Full character validation would require checksum verification
        const result = validateBtcAddress(
          'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
          'mainnet'
        );
        
        expect(result.valid).toBe(true);
      });

      it('should reject addresses with wrong prefix', () => {
        const result = validateBtcAddress(
          'xyz1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
          'mainnet'
        );
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid mainnet');
      });
    });
  });
});
