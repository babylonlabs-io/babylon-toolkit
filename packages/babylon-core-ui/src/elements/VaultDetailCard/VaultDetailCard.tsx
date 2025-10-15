import { Card } from "../../components/Card";
import { Menu, MenuItem } from "../../components/Menu";
import { ThreeDotsMenuIcon } from "../../components/Icons";
import { Avatar, AvatarGroup } from "../../components/Avatar";

interface VaultDetailCardProps {
  id: string;
  title: {
    icons: string[];
    text: string;
  };
  details: Array<{
    label: string;
    value: string | React.ReactNode;
  }>;
  actions?: Array<{
    name: string;
    action: string;
  }>;
  onAction?: (id: string, action: string) => void;
}

export function VaultDetailCard({
  id,
  title,
  details,
  actions = [],
  onAction,
}: VaultDetailCardProps) {
  return (
    <Card className="flex flex-col p-4">
      {/* Title row with icons, text, and menu */}
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          {title.icons.length > 0 && (
            <AvatarGroup size="small">
              {title.icons.map((icon, index) => (
                <Avatar
                  key={index}
                  url={icon}
                  alt={`Icon ${index + 1}`}
                  size="small"
                  variant="circular"
                />
              ))}
            </AvatarGroup>
          )}
          <span className="text-base font-semibold text-accent-primary">
            {title.text}
          </span>
        </div>
        {actions.length > 0 && (
          <Menu
            trigger={
              <button
                className="rounded p-1 hover:bg-surface-secondary"
                aria-label="Actions"
              >
                <ThreeDotsMenuIcon size={20} variant="accent-primary" />
              </button>
            }
            placement="bottom-end"
          >
            {actions.map((action) => (
              <MenuItem
                key={action.action}
                name={action.name}
                onClick={() => onAction?.(id, action.action)}
              />
            ))}
          </Menu>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-surface-secondary mb-3" />

      {/* Details section - label on left, value on right */}
      <div className="flex flex-col gap-3">
        {details.map((detail, index) => (
          <div key={index} className="flex items-start justify-between gap-4">
            <span className="text-xs text-accent-secondary whitespace-nowrap">
              {detail.label}
            </span>
            <div className="flex-1 flex justify-end text-right">
              {typeof detail.value === "string" ? (
                <span className="text-sm text-accent-primary">
                  {detail.value}
                </span>
              ) : (
                detail.value
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

