/**
 * Example component demonstrating the new clean architecture.
 * This shows how components should use the presentation hooks
 * instead of directly calling services or managing business logic.
 */

import { Button, Card } from "@babylonlabs-io/core-ui";

import { useETHWallet } from "../../../context/wallet";
import { satoshiToBtcNumber } from "../../../utils/btcConversion";
import { useDepositList } from "../../hooks/useDepositList";

export function DepositListExample() {
  // Get wallet address from context
  const { address: ethAddress } = useETHWallet();

  // Use the clean architecture hook for fetching deposits
  const { deposits, isLoading, error, pagination, loadMore, refetch } =
    useDepositList(ethAddress);

  if (isLoading && deposits.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center">Loading deposits...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-red-500">
          Error loading deposits: {error.message}
        </div>
        <Button onClick={refetch} className="mt-4">
          Retry
        </Button>
      </Card>
    );
  }

  if (deposits.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500">No deposits found</div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="mb-4 text-xl font-bold">Your Deposits</h2>

        <div className="space-y-3">
          {deposits.map((deposit) => (
            <div
              key={deposit.id}
              className="rounded-lg border p-4 transition-colors hover:bg-gray-50"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">
                    {satoshiToBtcNumber(deposit.amountSat).toFixed(8)} BTC
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    Status:{" "}
                    <span className={getStatusColor(deposit.status)}>
                      {deposit.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {deposit.confirmations}/{deposit.requiredConfirmations}{" "}
                    confirmations
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm text-gray-500">
                    {new Date(deposit.createdAt).toLocaleDateString()}
                  </div>
                  {deposit.canRedeem && (
                    <Button
                      size="small"
                      className="mt-2"
                      onClick={() => {
                        // This would trigger the redeem flow
                        console.log("Redeem deposit:", deposit.id);
                      }}
                    >
                      Redeem
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-3 border-t pt-3">
                <div className="text-xs text-gray-500">
                  Vault Providers:{" "}
                  {deposit.providers.map((p) => p.name).join(", ")}
                </div>
                {deposit.btcTransactionId && (
                  <div className="mt-1 text-xs text-gray-400">
                    BTC TX: {deposit.btcTransactionId.substring(0, 10)}...
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {pagination.hasMore && (
          <div className="mt-4 text-center">
            <Button onClick={loadMore} disabled={isLoading} variant="outlined">
              {isLoading
                ? "Loading..."
                : `Load More (${pagination.total - deposits.length} remaining)`}
            </Button>
          </div>
        )}
      </Card>

      <div className="text-center text-sm text-gray-500">
        Showing {deposits.length} of {pagination.total} deposits
      </div>
    </div>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "text-green-600";
    case "PENDING":
      return "text-yellow-600";
    case "CONFIRMING":
      return "text-blue-600";
    case "REDEEMED":
      return "text-gray-600";
    case "FAILED":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
}
