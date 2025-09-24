import {
  Button,
  Menu,
  MenuItem,
  ThreeDotsMenuIcon,
} from "@babylonlabs-io/core-ui";

import { ActivityCardActionButton } from "../ActivityCard";

interface MoreActionMenuProps {
  actions: ActivityCardActionButton[];
}

export function MoreActionMenu({ actions }: MoreActionMenuProps) {
  if (!actions || actions.length === 0) return null;

  const trigger = (
    <Button
      variant="outlined"
      size="small"
      aria-label="More actions"
      className="sm:bbn-btn-medium !h-9 flex-col items-center justify-center"
    >
      <ThreeDotsMenuIcon size={16} />
    </Button>
  );

  return (
    <Menu trigger={trigger} placement="bottom-end" className="min-w-48">
      {actions.map((action, index) => (
        <MenuItem
          key={index}
          name={action.label}
          onClick={action.onClick}
          disabled={action.disabled}
          className={action.className}
        />
      ))}
    </Menu>
  );
}
