import type { PropsWithChildren } from "react";

import { useHealthCheck } from "@/hooks/useHealthCheck";

export function HealthCheckWrapper({ children }: PropsWithChildren) {
  useHealthCheck();

  return <>{children}</>;
}
