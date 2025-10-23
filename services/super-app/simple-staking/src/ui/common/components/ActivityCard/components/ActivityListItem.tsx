import { twMerge } from "tailwind-merge";

export interface ActivityListItemData {
  icon?: string | React.ReactNode;
  iconAlt?: string;
  name: string;
  id?: string;
}

interface ActivityListItemProps {
  item: ActivityListItemData;
  className?: string;
}

export function ActivityListItem({ item, className }: ActivityListItemProps) {
  return (
    <div className={twMerge("flex min-w-0 items-center gap-2", className)}>
      <span className="flex items-center truncate text-xs font-medium text-accent-primary sm:text-sm">
        {item.name}
      </span>
      {item.icon && (
        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-xs sm:text-sm">
          {typeof item.icon === "string" ? (
            <img
              src={item.icon}
              alt={item.iconAlt || item.name}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            item.icon
          )}
        </div>
      )}
    </div>
  );
}
