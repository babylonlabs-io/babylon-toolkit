const { formatBalance } = require('../../src/ui/common/utils/formatCryptoBalance');

describe('formatBalance', () => {
  it('should format zero amounts', () => {
    expect(formatBalance(0, 'BTC')).toBe('0 BTC');
  });

  it('should display "<0.01" for very small amounts', () => {
    expect(formatBalance(0.001, 'BTC')).toBe('<0.01 BTC');
    expect(formatBalance(0.01, 'BTC')).toBe('0.01 BTC');
  });

  it('should format normal amounts correctly', () => {
    expect(formatBalance(1.5, 'BTC')).toBe('1.50 BTC');
    expect(formatBalance(0.123, 'BTC')).toBe('0.123 BTC');
  });

  it('should use custom minDisplayAmount', () => {
    // Test with 0.001 threshold
    expect(formatBalance(0.0005, 'BTC', 0.001)).toBe('<0.001 BTC');
    expect(formatBalance(0.001, 'BTC', 0.001)).toBe('0.001 BTC');
    
    // Test with 0.1 threshold  
    expect(formatBalance(0.05, 'BTC', 0.1)).toBe('<0.1 BTC');
    expect(formatBalance(0.1, 'BTC', 0.1)).toBe('0.1 BTC');
    
    // Test edge case right at threshold
    expect(formatBalance(0.009999, 'BTC', 0.01)).toBe('<0.01 BTC');
    expect(formatBalance(0.01, 'BTC', 0.01)).toBe('0.01 BTC');
  });
});

