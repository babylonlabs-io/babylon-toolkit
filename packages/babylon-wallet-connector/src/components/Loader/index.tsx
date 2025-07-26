import { Heading, Loader } from "@babylonlabs-io/core-ui";
import { twMerge } from "tailwind-merge";

interface LoaderProps {
  className?: string;
  title?: string;
}

export function LoaderScreen({ className, title }: LoaderProps) {
  return (
    <div className={twMerge("flex flex-col items-center justify-center gap-6", className)}>
      <div className="flex items-center justify-center bg-primary-contrast p-6">
        <Loader className="text-primary-light" />
      </div>
      {title && (
        <Heading variant="h4" className="capitalize text-accent-primary">
          {title}
        </Heading>
      )}
    </div>
  );
}
