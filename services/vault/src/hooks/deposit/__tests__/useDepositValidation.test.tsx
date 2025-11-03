/**
 * Tests for useDepositValidation hook
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

import { useDepositValidation } from '../useDepositValidation';

// Mock the useUTXOs hook
vi.mock('../../../hooks/useUTXOs', () => ({
  useUTXOs: vi.fn(() => ({
    confirmedUTXOs: [
      { txid: '0x123', vout: 0, value: 100000, scriptPubKey: '0xabc' },
      { txid: '0x456', vout: 1, value: 200000, scriptPubKey: '0xdef' },
    ],
    isLoading: false,
    error: null,
  })),
}));

describe('useDepositValidation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: ReactNode }) => {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

  describe('validateAmount', () => {
    it('should validate valid amount', () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      const validationResult = result.current.validateAmount('0.001');
      
      expect(validationResult.valid).toBe(true);
      expect(validationResult.error).toBeUndefined();
    });

    it('should reject invalid amount format', () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      const validationResult = result.current.validateAmount('invalid');
      
      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toBe('Invalid amount format');
    });

    it('should reject amount below minimum', () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      const validationResult = result.current.validateAmount('0.00001'); // Below minimum
      
      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain('Minimum deposit');
    });

    it('should use dynamic minimum based on fees', () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      expect(result.current.minDeposit).toBeGreaterThan(0n);
      expect(result.current.maxDeposit).toBe(21000000_00000000n);
    });
  });

  describe('validateProviders', () => {
    it('should validate single provider selection', async () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      // Wait for providers to load
      await waitFor(() => {
        expect(result.current.isLoadingProviders).toBe(false);
      });

      const validationResult = result.current.validateProviders([
        result.current.availableProviders[0],
      ]);

      expect(validationResult.valid).toBe(true);
    });

    it('should reject empty provider selection', async () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingProviders).toBe(false);
      });

      const validationResult = result.current.validateProviders([]);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain('at least one');
    });

    it('should reject invalid provider', async () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingProviders).toBe(false);
      });

      const validationResult = result.current.validateProviders([
        '0xinvalidprovider',
      ]);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain('Invalid vault provider');
    });

    it('should reject multiple providers', async () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingProviders).toBe(false);
      });

      const validationResult = result.current.validateProviders(
        result.current.availableProviders
      );

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain('Multiple providers not yet supported');
    });
  });

  describe('validateDeposit', () => {
    it('should validate complete deposit with valid data', async () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingProviders).toBe(false);
      });

      const formData = {
        amount: '0.001',
        selectedProviders: [result.current.availableProviders[0]],
      };

      const validationResult = await result.current.validateDeposit(formData);

      expect(validationResult.valid).toBe(true);
      expect(validationResult.error).toBeUndefined();
    });

    it('should reject invalid amount in complete validation', async () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingProviders).toBe(false);
      });

      const formData = {
        amount: '0.00001', // Below minimum
        selectedProviders: [result.current.availableProviders[0]],
      };

      const validationResult = await result.current.validateDeposit(formData);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain('Minimum deposit');
    });

    it('should check UTXOs when available', async () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingProviders).toBe(false);
      });

      const formData = {
        amount: '0.002', // 200,000 sats
        selectedProviders: [result.current.availableProviders[0]],
      };

      const validationResult = await result.current.validateDeposit(formData);

      expect(validationResult.valid).toBe(true);
      // Total UTXOs value is 300,000 sats, so should be sufficient
    });

    it('should warn when no UTXOs available yet', async () => {
      // Mock no UTXOs
      const useUTXOsMock = await import('../../../hooks/useUTXOs');
      vi.mocked(useUTXOsMock.useUTXOs).mockReturnValue({
        confirmedUTXOs: null,
        isLoading: false,
        error: null,
        pendingUTXOs: [],
        isConfirming: false,
        refetch: vi.fn(),
      } as any);

      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingProviders).toBe(false);
      });

      const formData = {
        amount: '0.001',
        selectedProviders: [result.current.availableProviders[0]],
      };

      const validationResult = await result.current.validateDeposit(formData);

      expect(validationResult.valid).toBe(true);
      expect(validationResult.warnings).toBeDefined();
      expect(validationResult.warnings![0]).toContain('UTXO validation will be performed');
    });

    it('should handle validation errors gracefully', async () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingProviders).toBe(false);
      });

      // Force an error by passing invalid data
      const formData = {
        amount: 'not-a-number',
        selectedProviders: [],
      };

      const validationResult = await result.current.validateDeposit(formData);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toBeDefined();
    });
  });

  describe('provider fetching', () => {
    it('should fetch available providers', async () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingProviders).toBe(false);
      });

      expect(result.current.availableProviders).toHaveLength(2);
      expect(result.current.availableProviders[0]).toBe(
        '0x1234567890abcdef1234567890abcdef12345678'
      );
    });

    it('should handle loading state', () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      // Initially might be loading
      expect(typeof result.current.isLoadingProviders).toBe('boolean');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined BTC address', () => {
      const { result } = renderHook(
        () => useDepositValidation(undefined),
        { wrapper }
      );

      const validationResult = result.current.validateAmount('0.001');
      
      expect(validationResult.valid).toBe(true);
    });

    it('should handle very large amounts', () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      const validationResult = result.current.validateAmount('21000001'); // More than max supply
      
      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain('Maximum deposit');
    });

    it('should handle negative amounts', () => {
      const { result } = renderHook(
        () => useDepositValidation('bc1qaddress'),
        { wrapper }
      );

      const validationResult = result.current.validateAmount('-0.001');
      
      expect(validationResult.valid).toBe(false);
    });
  });
});
