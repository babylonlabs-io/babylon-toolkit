import { Heading, Text } from "@babylonlabs-io/core-ui";
import { twMerge } from "tailwind-merge";

interface StatusViewProps {
  icon: React.ReactNode | string;
  title: string;
  description?: React.ReactNode;
  className?: string;
}

export const StatusView = ({
  icon,
  title,
  description,
  className,
}: StatusViewProps) => (
  <div
    className={twMerge("flex h-[21rem] items-center justify-center", className)}
  >
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[5.5rem] w-[5.5rem] bg-primary-contrast">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {icon}
        </div>
      </div>
      <Heading variant="h6" className="text-accent-primary">
        {title}
      </Heading>
      {description && (
        <Text variant="body1" className="text-center text-accent-primary">
          {description}
        </Text>
      )}
    </div>
  </div>
);
