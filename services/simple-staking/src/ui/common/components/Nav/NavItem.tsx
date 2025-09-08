import { NavLink } from "react-router";
import { twJoin } from "tailwind-merge";

interface NavItemProps {
  title: string;
  to: string;
}

export const NavItem = ({ title, to }: NavItemProps) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        twJoin(
          "flex h-10 w-32 items-center justify-center whitespace-nowrap text-center",
          isActive ? "text-accent-primary" : "text-accent-secondary",
        )
      }
    >
      {title}
    </NavLink>
  );
};
