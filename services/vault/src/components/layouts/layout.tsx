import { Outlet } from "react-router";
import { twJoin } from "tailwind-merge";
import { useIsMobile } from "@babylonlabs-io/core-ui";

export default function RootLayout() {
  const isMobile = useIsMobile();

  return (
    <div
      className={twJoin(
        "relative h-full min-h-svh w-full",
        !isMobile
          ? "dark:app-bg app-bg bg-cover bg-fixed bg-center bg-no-repeat"
          : "",
      )}
    >
      <div className="flex min-h-svh flex-col">
        <Outlet />
      </div>
    </div>
  );
}
