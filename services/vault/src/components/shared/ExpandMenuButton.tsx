import { Menu, MenuItem } from "@babylonlabs-io/core-ui";

import { MenuButton } from "./MenuButton";

interface ExpandMenuButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  "aria-label"?: string;
}

export function ExpandMenuButton({
  isExpanded,
  onToggle,
  "aria-label": ariaLabel = "Toggle details",
}: ExpandMenuButtonProps) {
  return (
    <Menu trigger={<MenuButton aria-label={ariaLabel} />} className="!min-w-0">
      <MenuItem
        name={isExpanded ? "Collapse" : "Expand"}
        onClick={onToggle}
        className="!p-4"
      />
    </Menu>
  );
}
