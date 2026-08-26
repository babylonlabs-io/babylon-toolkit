import { Header as CoreHeader, Nav } from "@babylonlabs-io/core-ui";
import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import { NavLink } from "react-router";
import { twJoin } from "tailwind-merge";

import { useAppState } from "@/ui/common/state";

import { Connect } from "../Wallet/Connect";

export const Header = () => {
  const { open } = useWalletConnect();
  const { isLoading: loading } = useAppState();

  const navItems = [
    { title: "BTC Staking", to: "/btc" },
    { title: "BABY Staking", to: "/baby" },
    { title: "Rewards", to: "/rewards" },
  ];

  const navigation = (
    <Nav>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            twJoin(
              "flex h-10 w-fit items-center justify-center whitespace-nowrap text-center",
              isActive ? "text-accent-primary" : "text-accent-secondary",
            )
          }
        >
          {item.title}
        </NavLink>
      ))}
    </Nav>
  );

  const mobileNavigation = (
    <>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            twJoin(
              "flex h-10 w-fit items-center justify-center whitespace-nowrap text-center",
              isActive ? "text-accent-primary" : "text-accent-secondary",
            )
          }
        >
          {item.title}
        </NavLink>
      ))}
    </>
  );

  return (
    <CoreHeader
      navigation={navigation}
      mobileNavigation={mobileNavigation}
      rightActions={<Connect loading={loading} onConnect={open} />}
    />
  );
};
