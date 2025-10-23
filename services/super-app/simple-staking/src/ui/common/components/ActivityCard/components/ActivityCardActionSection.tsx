import { Button } from "@babylonlabs-io/core-ui";

import { ActivityCardActionButton } from "../ActivityCard";

interface ActivityCardActionSectionProps {
  actions: ActivityCardActionButton[];
}

export function ActivityCardActionSection({
  actions,
}: ActivityCardActionSectionProps) {
  return (
    <div className="mt-4 space-y-2 sm:mt-6">
      {actions.map((action, index) => (
        <Button
          key={index}
          variant={action.variant || "outlined"}
          size={action.size || "small"}
          className={`sm:bbn-btn-medium ${action.fullWidth ? "w-full" : ""} ${action.className || ""}`}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
