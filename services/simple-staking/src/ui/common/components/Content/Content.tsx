import type { PropsWithChildren } from "react";
import { twMerge } from "tailwind-merge";

export const Content = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <main className={twMerge("w-full md:mx-auto md:max-w-3xl", className)}>
    {children}
  </main>
);
