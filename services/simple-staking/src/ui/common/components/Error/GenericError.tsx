import { Button, Heading, Text, Container } from "@babylonlabs-io/core-ui";
import { useNavigate } from "react-router";

import BitcoinBlock from "@/ui/common/assets/bitcoin-block.svg";

import { Footer } from "../Footer/Footer";
import { Header } from "../Header/Header";

interface Props {
  title?: string;
  message?: string;
  image?: any;
}

export default function GenericError({
  title = "Oops! Something Went Wrong",
  message = `It looks like we’re experiencing a temporary issue on our end.
  Our team is already on it, and we’ll have things back to normal as soon as possible.
  Please check back shortly, and thank you for your patience!`,
  image = BitcoinBlock,
}: Props) {
  const navigate = useNavigate();

  return (
    <div className="flex h-full min-h-svh w-full flex-col justify-between">
      <Header />

      <Container className="px-6 py-12">
        <div className="flex flex-col items-center justify-center gap-8">
          <img
            src={image}
            alt="Generic Error"
            className="h-auto w-full max-w-[120px]"
          />
          <Heading variant="h5" className="text-accent-primary">
            {title}
          </Heading>
          <div className="w-full max-w-[650px]">
            <Text variant="body1" className="text-center text-accent-primary">
              {message}
            </Text>
          </div>
          <Button
            variant="outlined"
            color="primary"
            onClick={() => navigate("/")}
          >
            Back to homepage
          </Button>
        </div>
      </Container>

      <Footer />
    </div>
  );
}
