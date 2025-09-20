import React from "react";
import {
  Card,
  Heading,
  Input,
  Button,
  FormControl,
  ListItem,
  List,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  Text,
  Copy,
  CopyIcon,
  ColumnProps,
  DisplayHash,
  SubSection,
} from "@babylonlabs-io/core-ui";
import { MdCancel } from "react-icons/md";
import { AiOutlinePlus, AiOutlineMinus } from "react-icons/ai";

export interface EligibilityDashboardProps {
  className?: string;
}

type EligibilityOverviewStakeRow = {
  id: string;
  txHash: string;
  stakedOn: string; // ISO date
  amountBtc: number;
  eligibility: "Eligible" | "Ineligible" | "Exceed Allocation";
};

const eligibilityOverviewColumns: ColumnProps<EligibilityOverviewStakeRow>[] = [
  {
    key: "txHash",
    header: "Stake Tx Hash",
    frozen: "left",
    render: (_value, row) => (
      <div className="flex items-center gap-2">
        <DisplayHash value={row.txHash} symbols={6} />
        <Copy value={row.txHash}>
          <CopyIcon size={14} className="text-accent-secondary" />
        </Copy>
      </div>
    ),
    sorter: (a, b) => a.txHash.localeCompare(b.txHash),
  },
  {
    key: "stakedOn",
    header: "Staked On",
    render: (_value, row) =>
      new Date(row.stakedOn).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    sorter: (a, b) => +new Date(a.stakedOn) - +new Date(b.stakedOn),
  },
  {
    key: "amountBtc",
    header: "Amount",
    render: (_value, row) => `${row.amountBtc} BTC`,
    sorter: (a, b) => a.amountBtc - b.amountBtc,
  },
  {
    key: "eligibility",
    header: "Eligibility",
    render: (_value, row) => {
      return <Text variant="body2">{row.eligibility}</Text>;
    },
  },
];

const eligibilityOverviewRows: EligibilityOverviewStakeRow[] = [
  {
    id: "1",
    txHash: "609b44H...9806D6",
    stakedOn: "2025-09-02",
    amountBtc: 0.05,
    eligibility: "Eligible",
  },
  {
    id: "2",
    txHash: "609b44H...9806D6",
    stakedOn: "2025-09-01",
    amountBtc: 0.0025,
    eligibility: "Eligible",
  },
  {
    id: "3",
    txHash: "609b44H...9806D6",
    stakedOn: "2025-08-10",
    amountBtc: 0.05,
    eligibility: "Ineligible",
  },
  {
    id: "4",
    txHash: "609b44H...9806D6",
    stakedOn: "2025-08-05",
    amountBtc: 0.0025,
    eligibility: "Exceed Allocation",
  },
];

type MultiStakingEligibilityRow = {
  id: string;
  title: string;
  amount: string;
};

const multiStakingEligibilityColumns: ColumnProps<MultiStakingEligibilityRow>[] =
  [
    {
      key: "title",
      header: "",
    },
    {
      key: "amount",
      header: "",
    },
  ];

const multiStakingEligibilityRows: MultiStakingEligibilityRow[] = [
  { id: "1", title: "Projected BABY Staking Points", amount: "205678.75" },
  { id: "2", title: "Projected Multi-Staking Amount", amount: "152.5 BTC" },
];

export const EligibilityDashboard: React.FC<EligibilityDashboardProps> = ({
  className = "",
}) => {
  return (
    <div className={`eligibility-dashboard ${className}`}>
      <Card className="flex w-full flex-col content-center justify-between">
        <div className="mb-10 flex flex-col gap-6">
          <Heading variant="h5" className="text-accent-primary">
            Multi-Staking Eligibility
          </Heading>

          <SubSection>
            <FormControl
              label="Use this tool to check if your BTC stakes qualify for Phase 3. Simply enter your BABY wallet address to view your eligible BTC stake total, the minimum BABY staking requirement, and how much more BABY you may need to stake. If your stakes do not yet meet the requirement, you will have the option to stake additional BABY directly from this page."
              hint=""
              state="default"
            >
              <Input
                placeholder="BABY address"
                suffix={<MdCancel size={24} className="cursor-pointer" />}
              />
            </FormControl>
          </SubSection>
        </div>
        <div className="mb-10 flex flex-col gap-2">
          <Heading variant="h6" className="text-accent-primary">
            Your Eligibility
          </Heading>
          <List orientation="horizontal">
            <ListItem
              title="BABY Staking Points"
              value="23457678.23"
              className="[&_div]:items-center"
            />
            <ListItem title="Eligible BTC for Multi-Staking" value="1.5 BTC" />
          </List>
        </div>

        <SubSection className="mb-10" variant="outlined">
          <Accordion fluid>
            <AccordionSummary
              className="b-p-2"
              renderIcon={(expanded) =>
                expanded ? <AiOutlineMinus /> : <AiOutlinePlus />
              }
              iconProps={{
                size: "small",
              }}
            >
              <Heading variant="h6" className="text-accent-primary">
                BTC Stakes Eligibility Overview
              </Heading>
            </AccordionSummary>
            <AccordionDetails className="b-p-2 pt-6" unmountOnExit>
              <Table
                fluid
                data={eligibilityOverviewRows}
                columns={eligibilityOverviewColumns}
              />
            </AccordionDetails>
          </Accordion>
        </SubSection>

        <div className="mb-4 flex flex-col gap-2">
          <Heading variant="h6" className="text-accent-primary">
            Projected Multi-staking Eligibility
          </Heading>
          <Table
            fluid
            data={multiStakingEligibilityRows}
            columns={multiStakingEligibilityColumns}
          />
        </div>

        <div className="mt-6">
          <Button
            onClick={() => {
              window.location.href = "/baby";
            }}
            fluid
          >
            Stake More BABY To Boost Your Eligibility
          </Button>
        </div>
      </Card>
    </div>
  );
};
