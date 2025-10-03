interface ProviderItemProps {
  name: string;
  icon?: string | React.ReactNode;
  iconAlt?: string;
  className?: string;
}

export function ProviderItem({
  name,
  icon,
  iconAlt,
  className = "",
}: ProviderItemProps) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {icon && (
        <div className="flex items-center justify-center w-8 h-8 flex-shrink-0">
          {typeof icon === "string" ? (
            <img
              src={icon}
              alt={iconAlt || name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            icon
          )}
        </div>
      )}
      <span className="text-xs text-accent-primary font-normal text-center">
        {name}
      </span>
    </div>
  );
}

