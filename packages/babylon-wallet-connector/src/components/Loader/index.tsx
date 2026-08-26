import { Heading, Loader, Text } from "@babylonlabs-io/core-ui";
import { twMerge } from "tailwind-merge";

interface LoaderProps {
  className?: string;
  title?: string;
  description?: string;
}

export function LoaderScreen({ className, title, description }: LoaderProps) {
  return (
    <div className={twMerge("flex flex-col items-center justify-center gap-6", className)}>
      <div className="flex items-center justify-center bg-primary-contrast p-6">
        <Loader className="text-primary-light" />
      </div>
      {(title || description) && (
        <div className="flex flex-col items-center gap-2 text-center">
          {title && (
            <Heading variant="h4" className="capitalize text-accent-primary">
              {title}
            </Heading>
          )}
          {description && (
            <Text as="div" className="text-accent-secondary">
              {description}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
