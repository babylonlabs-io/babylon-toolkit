import { useState, ReactNode } from "react";
import { Outlet, NavLink, useLocation } from "react-router";
import { MdOutlineMenu, MdClose } from "react-icons/md";
import { twJoin } from "tailwind-merge";
import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import { useIsMobile } from "@babylonlabs-io/core-ui";

import { useAppState } from "@services/simple-staking/ui/common/state";
import { Connect } from "@services/simple-staking/ui/common/components/Wallet/Connect";
import { Logo, MobileLogo, SmallLogo } from "./logos";
import { Container } from "./Container";
import { Footer } from "./Footer";
import { Banner } from "@services/simple-staking/ui/common/components/Banner/Banner";
import { CoStakingBanner } from "@services/simple-staking/ui/common/components/CoStakingBanner";
import FF from "@services/simple-staking/ui/common/utils/FeatureFlagService";
import { network } from "@services/simple-staking/ui/common/config/network/btc";
import { Network } from "@services/simple-staking/ui/common/types/network";

interface NavItem {
    title: string;
    to: string;
}

const NAV_ITEMS: NavItem[] = [
    { title: "BTC Staking", to: "/btc" },
    { title: "BABY Staking", to: "/baby" },
    { title: "Rewards", to: "/rewards" },
    { title: "Vault", to: "/vault" },
];

const Nav = ({ children }: { children: ReactNode }) => (
    <nav className="flex items-center justify-center gap-5 lg:gap-14">{children}</nav>
);

const NavItemComponent = ({ title, to }: NavItem) => (
    <NavLink
        to={to}
        className={({ isActive }) =>
            twJoin(
                "flex h-10 w-fit items-center justify-center whitespace-nowrap text-center",
                isActive ? "text-accent-primary" : "text-accent-secondary",
            )
        }
    >
        {title}
    </NavLink>
);

const MobileNavOverlay = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-surface">
            <div className="container mx-auto flex h-20 items-center gap-4 px-4 sm:px-0">
                <MobileLogo />
                <button
                    type="button"
                    aria-label="Close menu"
                    onClick={onClose}
                    className="cursor-pointer text-accent-primary"
                >
                    <MdClose size={32} />
                </button>
            </div>

            <nav className="container m-auto flex flex-col gap-9 px-4 pb-20 sm:px-0">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                            twJoin(
                                "text-2xl",
                                isActive ? "text-accent-primary" : "text-accent-secondary",
                            )
                        }
                    >
                        {item.title}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
};

const Header = () => {
    const { open } = useWalletConnect();
    const { isLoading: loading } = useAppState();
    const isMobileView = useIsMobile();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <header className="mb-20">
            <Container className="relative flex h-20 items-center justify-between">
                <div className="flex items-center gap-4">
                    {isMobileView ? (
                        <>
                            <MobileLogo />
                            <button
                                type="button"
                                aria-label="Open menu"
                                className="cursor-pointer text-accent-primary"
                                onClick={() => setIsMobileMenuOpen(true)}
                            >
                                <MdOutlineMenu size={32} />
                            </button>
                        </>
                    ) : (
                        <SmallLogo />
                    )}
                </div>

                {!isMobileView && (
                    <div className="absolute left-1/2 -translate-x-1/2 transform">
                        <Nav>
                            {NAV_ITEMS.map((item) => (
                                <NavItemComponent key={item.to} {...item} />
                            ))}
                        </Nav>
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <Connect loading={loading} onConnect={open} />
                </div>
            </Container>
            <MobileNavOverlay
                open={isMobileView && isMobileMenuOpen}
                onClose={() => setIsMobileMenuOpen(false)}
            />
        </header>
    );
};

export const SharedLayout = () => {
    const isMobile = useIsMobile();

    return (
        <div
            className={twJoin(
                `relative h-full min-h-svh w-full`,
                network === Network.MAINNET ? "main-app-mainnet" : "main-app-testnet",
                !isMobile
                    ? `dark:app-bg app-bg bg-cover bg-fixed bg-center bg-no-repeat`
                    : "",
            )}
        >
            <div className="flex min-h-svh flex-col">
                <Banner />
                {FF.IsCoStakingEnabled && <CoStakingBanner />}
                <Header />

                <Outlet />

                <div className="mt-auto">
                    <Footer />
                </div>
            </div>
        </div>
    );
};

