import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import { Dialog, DialogFooter, DialogBody, DialogHeader } from "./index";

import { ScrollLocker } from "@/context/Dialog.context";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Form";
import { Text } from "@/components/Text";
import { Heading } from "@/index";
import { WarningIcon } from "@/components/Icons";

const meta: Meta<typeof Dialog> = {
  component: Dialog,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
  render: (props) => {
    const [visible, setVisibility] = useState(false);

    return (
      <ScrollLocker>
        <Button
          onClick={() => {
            setVisibility(true);
          }}
        >
          Push me softly
        </Button>

        <Dialog
          {...props}
          open={visible}
          onClose={() => {
            setVisibility(false);
          }}
        >
          <DialogHeader
            title="Bitcoin Inscriptions"
            className="text-accent-primary"
            onClose={() => {
              setVisibility(false);
            }}
          >
            <Text>Subtitle</Text>
          </DialogHeader>

          <DialogBody className="pb-8 pt-4 text-accent-primary">
            <Text className="mb-6" variant="body1">
              This staking interface attempts to detect bitcoin ordinals, NFTs, Ruins, and other inscriptions
              (“Inscriptions”) within the Unspent Transaction Outputs (“UTXOs”) in your wallet. If you stake bitcoin
              with Inscriptions, those UTXOs may be spent on staking, unbonding, or withdrawal fees, which will cause
              you to lose those Inscriptions permanently. This interface will not detect all Inscriptions.
            </Text>

            <Text variant="body1">Chose one: (you can change this later)</Text>

            <Checkbox checked labelClassName="mt-6" label="Don't show again" />
          </DialogBody>

          <DialogFooter>
            <Button
              fluid
              variant="outlined"
              onClick={() => {
                setVisibility(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </Dialog>
      </ScrollLocker>
    );
  },
};

export const NoBackdrop: Story = {
  args: {
    hasBackdrop: false,
  },
  render: (props) => {
    const [visible, setVisibility] = useState(false);

    return (
      <ScrollLocker>
        <Button
          onClick={() => {
            setVisibility(true);
          }}
        >
          Push me softly
        </Button>

        <Dialog {...props} open={visible} hasBackdrop={false}>
          <DialogBody className="flex flex-col items-center pb-8 pt-4 text-primary-dark">
            <WarningIcon size={88} variant="default" />
            <Heading variant="h5" className="mt-4">
              Unbonding Error
            </Heading>
            <Text variant="body1" className="mt-2 text-center">
              Your request to unbond failed due to: Failed to sign PSBT for the unbonding transaction
            </Text>
          </DialogBody>

          <DialogFooter>
            <Button
              fluid
              variant="outlined"
              onClick={() => {
                setVisibility(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </Dialog>
      </ScrollLocker>
    );
  },
};
