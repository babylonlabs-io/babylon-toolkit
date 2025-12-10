import { Container, Heading, Text } from "@babylonlabs-io/core-ui";
import { Route, Routes } from "react-router";

function AaveComingSoon() {
  return (
    <Container className="py-12">
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <Heading variant="h4">Aave V4 Integration</Heading>
        <Text variant="body1" className="text-accent-secondary">
          Coming soon. The Aave V4 integration is currently under development.
        </Text>
      </div>
    </Container>
  );
}

export function AaveRoutes() {
  return (
    <Routes>
      <Route path="*" element={<AaveComingSoon />} />
    </Routes>
  );
}
