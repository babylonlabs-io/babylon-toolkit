interface ActivityCardAmountSectionProps {
  formattedAmount: string;
  icon?: string | React.ReactNode;
  iconAlt?: string;
  chainName?: string;
  chainIcon?: string | React.ReactNode;
  chainIconAlt?: string;
}

export function ActivityCardAmountSection({
  formattedAmount,
  icon,
  iconAlt,
  chainName,
  chainIcon,
  chainIconAlt,
}: ActivityCardAmountSectionProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon &&
          (typeof icon === "string" ? (
            <img
              src={icon}
              alt={iconAlt || "icon"}
              className="w-6 h-6 sm:w-8 sm:h-8"
            />
          ) : (
            icon
          ))}
        <span className="text-base sm:text-lg font-medium text-accent-primary">
          {formattedAmount}
        </span>
      </div>

      {chainName && (
        <div className="flex items-center gap-2">
          <span className="text-base sm:text-lg font-medium text-accent-primary">
            {chainName}
          </span>
          {chainIcon &&
            (typeof chainIcon === "string" ? (
              <img
                src={chainIcon}
                alt={chainIconAlt || "chain icon"}
                className="w-6 h-6 sm:w-8 sm:h-8"
              />
            ) : (
              chainIcon
            ))}
        </div>
      )}
    </div>
  );
}
