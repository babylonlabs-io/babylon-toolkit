import type { CSSProperties, ReactNode } from "react";
import { SubSection } from "../SubSection";
import { Text } from "../Text";
import { CloseIcon } from "../Icons";
import { twMerge } from "tailwind-merge";

export interface DismissibleSubSectionProps {
  icon?: ReactNode;
  title: ReactNode;
  content: ReactNode;
  onCloseClick: () => void;
  className?: string;
  style?: CSSProperties;
}

export const DismissibleSubSection = ({
  icon,
  title,
  content,
  onCloseClick,
  className,
  style,
}: DismissibleSubSectionProps) => {
  return (
    <SubSection className={twMerge("flex gap-3", className)} style={style}>
      {icon}
      <div className="flex flex-col gap-1">
        {typeof title === "string" ? (
          <Text variant="subtitle1" className="text-accent-primary">
            {title}
          </Text>
        ) : (
          title
        )}

        {typeof content === "string" ? (
          <Text variant="body1" className="text-accent-secondary">
            {content}
          </Text>
        ) : (
          content
        )}
      </div>
      <button
        type="button"
        className="cursor-pointer self-start"
        aria-label="Dismiss subsection"
        onClick={onCloseClick}
      >
        <CloseIcon size={14} variant="accent-primary" />
      </button>
    </SubSection>
  );
};

export default DismissibleSubSection;
