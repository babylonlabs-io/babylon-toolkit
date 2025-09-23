import { Container } from "../Container/Container";
import { SmallLogo } from "../Logo/SmallLogo";
import { Nav } from "../Nav/Nav";
import { NavItem } from "../Nav/NavItem";

export const SimplifiedHeader = () => {
  return (
    <header className="mb-20">
      <Container className="relative flex h-20 items-center justify-between">
        <div className="flex items-center">
          <SmallLogo />
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 transform">
          <Nav>
            <NavItem title="BTC Staking" to="/btc" />
            <NavItem title="BABY Staking" to="/baby" />
          </Nav>
        </div>
      </Container>
    </header>
  );
};
