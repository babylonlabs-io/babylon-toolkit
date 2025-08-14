import { Button } from "../../../../components/Button";

import { ActivityCardActionButton } from "../ActivityCard";

interface ActivityCardActionSectionProps {
  actions: ActivityCardActionButton[];
}

export function ActivityCardActionSection({
  actions,
}: ActivityCardActionSectionProps) {
  // Sort actions to ensure Cancel comes before Retry
  const sortedActions = [...actions].sort((a, b) => {
    const aIsRetry = a.label.toLowerCase() === "retry";
    const bIsRetry = b.label.toLowerCase() === "retry";
    const aIsCancel = a.label.toLowerCase() === "cancel";
    const bIsCancel = b.label.toLowerCase() === "cancel";

    // Cancel should come first, Retry should come last
    if (aIsCancel && bIsRetry) return -1;
    if (aIsRetry && bIsCancel) return 1;
    return 0;
  });

  return (
    <div className="mt-4 sm:mt-6 flex gap-2">
      {sortedActions.map((action, index) => {
        // For error states: Retry should be contained, Cancel should be outlined
        // For regular secondary actions: default to outlined
        let variant: "contained" | "outlined" = "outlined";
        if (action.label.toLowerCase() === "retry") {
          variant = "contained";
        } else if (action.variant) {
          variant = action.variant;
        }

        return (
          <Button
            key={`${action.label}-${index}`}
            variant={variant}
            className={`sm:bbn-btn-medium flex-1 ${action.className || ""}`}
            onClick={action.onClick}
            fluid
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}
