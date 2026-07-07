import { ChevronRightIcon } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  body: string;
  extra?: ReactNode;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

export function FeatureCard({
  icon,
  title,
  body,
  extra,
  expandable = false,
  expanded = false,
  onToggle,
}: FeatureCardProps) {
  const showFull = !expandable || expanded;

  const content = (
    <div className="flex w-full items-start gap-2">
      <span className="mt-0.5 shrink-0 text-accent-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="block text-base tracking-[0.15px] text-accent-primary">
          {title}
        </span>
        <span
          className={`text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary ${showFull ? "block" : "line-clamp-1 max-w-sm"}`}
        >
          {body}
        </span>
        {extra && showFull && <div className="mt-2">{extra}</div>}
      </div>
      {expandable && (
        <ChevronRightIcon
          size={18}
          variant="secondary"
          className={`mt-1 shrink-0 transition-transform ${expanded ? "-rotate-90" : ""}`}
        />
      )}
    </div>
  );

  return (
    <div className="rounded bg-secondary-highlight">
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="w-full p-3 text-left"
        >
          {content}
        </button>
      ) : (
        <div className="p-3">{content}</div>
      )}
    </div>
  );
}
