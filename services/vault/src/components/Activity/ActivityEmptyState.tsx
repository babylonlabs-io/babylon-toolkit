/**
 * ActivityEmptyState Component
 * Shown when there are no activities to display
 */

import { Button } from "@babylonlabs-io/core-ui";
import { useNavigate } from "react-router";

interface ActivityEmptyStateProps {
  isConnected: boolean;
}

export function ActivityEmptyState({ isConnected }: ActivityEmptyStateProps) {
  const navigate = useNavigate();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg text-accent-secondary">
          Connect your wallet to view your activity
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <p className="text-lg text-accent-secondary">
        No activity yet. Make your first deposit to get started.
      </p>
      <Button color="secondary" rounded onClick={() => navigate("/")}>
        Go to Dashboard
      </Button>
    </div>
  );
}
