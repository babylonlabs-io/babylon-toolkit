import { Button } from "../../../../components/Button";

import { ActivityCardActionButton } from "../ActivityCard";

interface ActivityCardActionSectionProps {
  actions: ActivityCardActionButton[];
}

export function ActivityCardActionSection({
  actions,
}: ActivityCardActionSectionProps) {
  return (
    <div className="mt-4 sm:mt-6 flex gap-2">
      {actions.map((action, index) => (
        <Button
          key={`${action.label}-${index}`}
          variant={action.variant || "outlined"}
          className={`sm:bbn-btn-medium flex-1 ${action.className || ""}`}
          onClick={action.onClick}
          fluid
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
