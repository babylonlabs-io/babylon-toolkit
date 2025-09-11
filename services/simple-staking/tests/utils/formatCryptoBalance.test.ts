const { formatCryptoBalance, formatBalance } = require('../../src/ui/common/utils/formatCryptoBalance');

describe('formatCryptoBalance', () => {
  it('should format zero amounts', () => {
    expect(formatCryptoBalance(0, 'BTC')).toBe('0 BTC');
  });

  it('should display "<0.01" for very small amounts', () => {
    expect(formatCryptoBalance(0.001, 'BTC')).toBe('<0.01 BTC');
    expect(formatCryptoBalance(0.01, 'BTC')).toBe('0.01 BTC');
  });

  it('should format normal amounts correctly', () => {
    expect(formatCryptoBalance(1.5, 'BTC')).toBe('1.50 BTC');
    expect(formatCryptoBalance(0.123, 'BTC')).toBe('0.123 BTC');
  });

  it('should use custom minDisplayAmount', () => {
    // Test with 0.001 threshold
    expect(formatCryptoBalance(0.0005, 'BTC', 0.001)).toBe('<0.001 BTC');
    expect(formatCryptoBalance(0.001, 'BTC', 0.001)).toBe('0.001 BTC');
    
    // Test with 0.1 threshold  
    expect(formatCryptoBalance(0.05, 'BTC', 0.1)).toBe('<0.1 BTC');
    expect(formatCryptoBalance(0.1, 'BTC', 0.1)).toBe('0.1 BTC');
    
    // Test edge case right at threshold
    expect(formatCryptoBalance(0.009999, 'BTC', 0.01)).toBe('<0.01 BTC');
    expect(formatCryptoBalance(0.01, 'BTC', 0.01)).toBe('0.01 BTC');
  });
});

describe('formatBalance', () => {
  const satoshiToBtc = (satoshis: number) => satoshis / 100000000;

  it('should format without conversion', () => {
    expect(formatBalance(1.5, 'BTC')).toBe('1.50 BTC');
  });

  it('should convert and format', () => {
    expect(formatBalance(100000000, 'BTC', satoshiToBtc)).toBe('1.00 BTC');
    expect(formatBalance(500000, 'BTC', satoshiToBtc)).toBe('<0.01 BTC');
  });

  it('should use custom minDisplayAmount', () => {
    // 50000 satoshis = 0.0005 BTC, which is < 0.001 threshold
    expect(formatBalance(50000, 'BTC', satoshiToBtc, 0.001)).toBe('<0.001 BTC');
    
    // 100000 satoshis = 0.001 BTC, which equals 0.001 threshold
    expect(formatBalance(100000, 'BTC', satoshiToBtc, 0.001)).toBe('0.001 BTC');
    
    // Test with different threshold: 10000000 satoshis = 0.1 BTC, < 0.2 threshold
    expect(formatBalance(10000000, 'BTC', satoshiToBtc, 0.2)).toBe('<0.2 BTC');
    expect(formatBalance(20000000, 'BTC', satoshiToBtc, 0.2)).toBe('0.2 BTC');
  });
});
