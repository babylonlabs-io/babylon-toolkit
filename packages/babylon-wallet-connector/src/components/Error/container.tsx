import { useWidgetState } from "@/hooks/useWidgetState";

import { Error } from "./index";

interface ErrorContainer {
  className?: string;
}

export function ErrorContainer({ className }: ErrorContainer) {
  const { screen } = useWidgetState();
  const { icon, title, description, cancelButton, submitButton, onCancel, onSubmit } = screen.params ?? {};

  return (
    <Error
      className={className}
      icon={icon}
      title={title}
      description={description}
      cancelButton={cancelButton}
      submitButton={submitButton}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );
}
