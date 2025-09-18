import { Button, DialogBody, DialogFooter, Heading, Text } from "@babylonlabs-io/core-ui";
import {} from "react";

interface ErrorProps {
  className?: string;
  icon?: JSX.Element;
  title: string | JSX.Element;
  description: string | JSX.Element;
  cancelButton?: string | JSX.Element;
  submitButton?: string | JSX.Element;
  onCancel?: () => void;
  onSubmit?: () => void;
}

const DEFAULT_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52" fill="none">
    <path
      d="M2.16675 46.5837H49.8334L26.0001 5.41699L2.16675 46.5837ZM28.1667 40.0837H23.8334V35.7503H28.1667V40.0837ZM28.1667 31.417H23.8334V22.7503H28.1667V31.417Z"
      fill="#387085"
    />
  </svg>
);

export function Error({
  className,
  icon = DEFAULT_ICON,
  title,
  description,
  cancelButton = "Cancel",
  submitButton = (
    <>
      Continue <span className="hidden md:inline">Anyway</span>
    </>
  ),
  onCancel,
  onSubmit,
}: ErrorProps) {
  return (
    <div className={className}>
      <DialogBody className="py-16 text-center">
        <div className="mb-6 inline-flex size-20 items-center justify-center bg-primary-contrast text-primary-light">
          {icon}
        </div>

        <Heading variant="h4" className="mb-4 text-accent-primary">
          {title}
        </Heading>

        <Text as="div" className="text-accent-secondary">
          {description}
        </Text>
      </DialogBody>

      <DialogFooter className="flex gap-4">
        {cancelButton && (
          <Button variant="outlined" fluid onClick={onCancel}>
            {cancelButton}
          </Button>
        )}

        {submitButton && (
          <Button fluid onClick={onSubmit} data-testid="error-continue-button">
            {submitButton}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
