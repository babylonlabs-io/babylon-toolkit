import { Card } from '@babylonlabs-io/core-ui';
import { useState } from 'react';
import {
  createPegInTransaction,
  type PegInResult,
} from '../../transactions/btc/pegin';

export function PegInTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PegInResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreatePegIn = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Test parameters - all dummy data for POC
      const testResult = await createPegInTransaction({
        depositTxid: '0'.repeat(64),
        depositVout: 0,
        depositValue: 100_000_000n, // 1 BTC
        depositScriptPubKey: '5120' + 'a'.repeat(64), // dummy P2TR script
        depositorPubkey:
          '6f13a6d104446520d1757caec13eaf6fbcf29f488c31e0107e7351d4994cd068',
        claimerPubkey:
          'f5199efae3f28bb82476163a7e458c7ad445d9bffb0682d10d3bdb2cb41f8e8e',
        challengerPubkeys: [
          '17921cf156ccb4e73d428f996ed11b245313e37e27c978ac4d2cc21eca4672e4',
          '76d1ae01f8fb6bf30108731c884cddcf57ef6eef2d9d9559e130894e0e40c62c',
        ],
        pegInAmount: 50_000_000n, // 0.5 BTC to lock
        fee: 10_000n, // 10k sats fee
        network: 'testnet',
      });

      setResult(testResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Action Card */}
      <Card className="bg-surface flex flex-col gap-4 p-6">
        <h2 className="text-primary text-lg font-semibold">
          Create Test PegIn Transaction
        </h2>
        <p className="text-secondary text-sm">
          Click the button below to create a PegIn transaction using hardcoded
          test data. This demonstrates the Rust WASM module working in the
          browser.
        </p>

        <div className="bg-tertiary rounded-md p-4">
          <p className="text-secondary mb-2 text-xs font-semibold">
            Test Parameters:
          </p>
          <ul className="text-tertiary space-y-1 font-mono text-xs">
            <li>• Deposit: 1 BTC (100,000,000 sats)</li>
            <li>• PegIn Amount: 0.5 BTC (50,000,000 sats)</li>
            <li>• Fee: 10,000 sats</li>
            <li>• Network: testnet</li>
            <li>• Challengers: 2 dummy pubkeys</li>
          </ul>
        </div>

        <button
          onClick={handleCreatePegIn}
          disabled={loading}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md px-4 py-2 font-medium transition-colors"
        >
          {loading ? 'Creating Transaction...' : 'Create PegIn Transaction'}
        </button>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-destructive bg-destructive/10 flex flex-col gap-2 border p-6">
          <h3 className="text-destructive text-lg font-semibold">Error</h3>
          <p className="text-destructive/80 font-mono text-sm">{error}</p>
        </Card>
      )}

      {/* Success Display */}
      {result && (
        <Card className="bg-surface flex flex-col gap-4 p-6">
          <h3 className="text-primary text-lg font-semibold">
            ✅ Transaction Created Successfully!
          </h3>

          <div className="space-y-4">
            {/* Transaction ID */}
            <div>
              <label className="text-secondary mb-1 block text-xs font-semibold">
                Transaction ID
              </label>
              <div className="bg-tertiary text-primary break-all rounded-md p-3 font-mono text-xs">
                {result.txid}
              </div>
            </div>

            {/* Vault Script PubKey */}
            <div>
              <label className="text-secondary mb-1 block text-xs font-semibold">
                Vault Script PubKey (Taproot)
              </label>
              <div className="bg-tertiary text-primary break-all rounded-md p-3 font-mono text-xs">
                {result.vaultScriptPubKey}
              </div>
            </div>

            {/* Values */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-secondary mb-1 block text-xs font-semibold">
                  Vault Value
                </label>
                <div className="bg-tertiary text-primary rounded-md p-3 font-mono text-sm">
                  {result.vaultValue.toLocaleString()} sats
                </div>
              </div>
              <div>
                <label className="text-secondary mb-1 block text-xs font-semibold">
                  Change Value
                </label>
                <div className="bg-tertiary text-primary rounded-md p-3 font-mono text-sm">
                  {result.changeValue.toLocaleString()} sats
                </div>
              </div>
            </div>

            {/* Transaction Hex */}
            <div>
              <label className="text-secondary mb-1 block text-xs font-semibold">
                Transaction Hex (Raw)
              </label>
              <div className="bg-tertiary text-primary max-h-32 overflow-y-auto break-all rounded-md p-3 font-mono text-xs">
                {result.txHex}
              </div>
            </div>
          </div>

          <div className="bg-primary/10 text-primary rounded-md p-4 text-sm">
            <p className="font-semibold">🎉 WASM Integration Working!</p>
            <p className="text-primary/80 mt-1 text-xs">
              The Rust code successfully compiled to WebAssembly and created a
              Bitcoin transaction in the browser
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
