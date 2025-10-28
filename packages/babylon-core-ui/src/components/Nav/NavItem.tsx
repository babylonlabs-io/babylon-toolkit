import { twJoin } from "tailwind-merge";

export interface NavItemProps {
  title: string;
  href: string;
  onClick?: () => void;
  isActive?: boolean;
}

export const NavItem = ({ title, href, onClick, isActive }: NavItemProps) => {
  return (
    <a
      href={href}
      onClick={onClick}
      className={twJoin(
        "flex h-10 w-fit items-center justify-center whitespace-nowrap text-center",
        isActive ? "text-accent-primary" : "text-accent-secondary",
      )}
    >
      {title}
    </a>
  );
};

