import { Outlet } from "react-router";

import "@/ui/globals.css";

export default function RootLayout() {
  return (
    <div className="relative h-full min-h-svh w-full">
      <div className="flex min-h-svh flex-col">
        <Outlet />
      </div>
    </div>
  );
}
