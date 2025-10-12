/**
 * Empty state component shown when wallet is not connected
 */

export function EmptyState() {
  return (
    <div className="container mx-auto flex max-w-[760px] flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="text-center">
        <h2 className="mb-4 text-2xl font-semibold">Connect Your Wallet</h2>
        <p className="text-gray-600">Please connect your wallet to view your vault activities</p>
      </div>
    </div>
  );
}
