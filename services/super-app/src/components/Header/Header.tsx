import { useWalletConnect } from '@babylonlabs-io/wallet-connector';
import { useState } from 'react';
import { MdOutlineMenu } from 'react-icons/md';

import { Container } from '@services/simple-staking/src/ui/common/components/Container/Container';
import {
  MobileNavOverlay,
  Nav,
  NavItem,
} from '@services/simple-staking/src/ui/common/components/Nav';
import { useIsMobileView } from '@services/simple-staking/src/ui/common/hooks/useBreakpoint';
import { useAppState } from '@services/simple-staking/src/ui/common/state';
import FF from '@services/simple-staking/src/ui/common/utils/FeatureFlagService';

import { MobileLogo } from '@services/simple-staking/src/ui/common/components/Logo/MobileLogo';
import { SmallLogo } from '@services/simple-staking/src/ui/common/components/Logo/SmallLogo';
import { Connect } from '@services/simple-staking/src/ui/common/components/Wallet/Connect';

export const Header = () => {
  const { open } = useWalletConnect();
  const { isLoading: loading } = useAppState();
  const isMobileView = useIsMobileView();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="mb-20">
      <Container className="relative flex h-20 items-center justify-between">
        <div className="flex items-center gap-4">
          {isMobileView ? (
            <>
              <MobileLogo />
              {FF.IsBabyStakingEnabled && (
                <button
                  type="button"
                  aria-label="Open menu"
                  className="cursor-pointer text-accent-primary"
                  onClick={() => setIsMobileMenuOpen(true)}
                >
                  <MdOutlineMenu size={32} />
                </button>
              )}
            </>
          ) : (
            <SmallLogo />
          )}
        </div>

        {FF.IsBabyStakingEnabled && !isMobileView && (
          <div className="absolute left-1/2 -translate-x-1/2 transform">
            <Nav>
              <NavItem title="BTC Staking" to="/btc" />
              <NavItem title="BABY Staking" to="/baby" />
            </Nav>
          </div>
        )}

        <div className="flex items-center gap-4">
          <Connect loading={loading} onConnect={open} />
        </div>
      </Container>
      {FF.IsBabyStakingEnabled && (
        <MobileNavOverlay
          open={isMobileView && isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        />
      )}
    </header>
  );
};
