import { twJoin } from "tailwind-merge";

import { Container } from "../Container/Container";
import { Logo } from "../Logo/Logo";

export const SimplifiedHeader = ({
  isMinimal = false,
}: {
  isMinimal?: boolean;
}) => {
  return (
    <nav className="w-full">
      <section
        className={twJoin(
          "w-full bg-primary-main",
          isMinimal ? "h-[84px]" : "h-[300px]",
        )}
      >
        <Container className="flex h-20 items-center justify-between p-6">
          <Logo />
        </Container>
      </section>
    </nav>
  );
};
