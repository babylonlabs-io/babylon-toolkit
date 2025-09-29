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
    <SubSection className={twMerge("flex gap-3 ", className)} style={style}>
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
      <div
        className="cursor-pointer"
        aria-label="Dismiss subsection"
        onClick={onCloseClick}
      >
        <CloseIcon size={14} variant="accent-primary" />
      </div>
    </SubSection>
  );
};

export default DismissibleSubSection;
