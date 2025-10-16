interface StatusBadgeProps {
  status: "active" | "inactive" | "pending" | "default";
  label?: string;
  className?: string;
}

const STATUS_DOT_COLORS: Record<StatusBadgeProps["status"], string> = {
  active: "bg-success-main",
  pending: "bg-warning-main",
  inactive: "bg-accent-disabled",
  default: "bg-info-main",
};

export function StatusBadge({
  status,
  label,
  className = "",
}: StatusBadgeProps) {
  const statusLabel = label || status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[status] || STATUS_DOT_COLORS.default}`}
      />
      <span className="text-sm text-accent-primary font-normal">
        {statusLabel}
      </span>
    </span>
  );
}

