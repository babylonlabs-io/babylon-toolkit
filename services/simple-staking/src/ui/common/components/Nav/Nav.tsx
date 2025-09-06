import { ReactNode } from "react";

interface NavProps {
  children: ReactNode;
}

export const Nav = ({ children }: NavProps) => {
  return (
    <nav className="flex items-center justify-center gap-6">{children}</nav>
  );
};
