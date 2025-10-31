/**
 * Position Overview Component
 *
 * Main orchestrator component that:
 * - Fetches and transforms position data
 * - Handles navigation
 * - Renders appropriate view (table vs cards) based on screen size
 */

import { useIsMobile } from "@babylonlabs-io/core-ui";
import { useNavigate } from "react-router";

import type { Position } from "../../../types/position";

import { usePositionData } from "./hooks/usePositionData";
import { PositionOverviewCards } from "./PositionOverviewCards";
import { PositionOverviewTable } from "./PositionOverviewTable";

export function Position() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Fetch and transform position data
  const { positions, loading, ethAddress } = usePositionData();

  // Navigate to position detail page (defaults to repay tab)
  const handlePositionClick = (position: Position) => {
    navigate(`/position/${position.id}?tab=repay`);
  };

  // Loading state
  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-accent-secondary">
        Loading positions...
      </div>
    );
  }

  // Empty state
  if (positions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-accent-secondary">
        {ethAddress
          ? "No positions available"
          : "Connect wallet to view positions"}
      </div>
    );
  }

  // Render appropriate view based on screen size
  return isMobile ? (
    <PositionOverviewCards
      positions={positions}
      onPositionClick={handlePositionClick}
    />
  ) : (
    <PositionOverviewTable
      positions={positions}
      onPositionClick={handlePositionClick}
    />
  );
}
