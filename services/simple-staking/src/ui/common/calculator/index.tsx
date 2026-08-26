import {
  Button,
  Card,
  Container,
  Heading,
  Text,
  NumberField,
  Form,
} from "@babylonlabs-io/core-ui";
import { useState, useCallback } from "react";
import { object, string } from "yup";

import { Content } from "@/ui/common/components/Content/Content";
import { Section } from "@/ui/common/components/Section/Section";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { btcToSatoshi } from "@/ui/common/utils/btc";
import { babyToUbbn } from "@/ui/common/utils/bbn";
import { getPersonalizedAPR } from "@/ui/common/api/getAPR";
import type { PersonalizedAPRResponse } from "@/ui/common/types/api/coStaking";

interface CalculatorFormData {
  btcAmount: string;
  babyAmount: string;
}

const formSchema = object({
  btcAmount: string().required("BTC amount is required"),
  babyAmount: string().required("BABY amount is required"),
});

function formatPercent(value: number | string | undefined | null): string {
  if (value === undefined || value === null) {
    return "N/A";
  }
  const numValue = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(numValue)) {
    return "N/A";
  }
  return `${(numValue * 100).toFixed(2)}%`;
}

export default function CalculatorPage() {
  const { coinSymbol: btcSymbol } = getNetworkConfigBTC();
  const { coinSymbol: babySymbol } = getNetworkConfigBBN();

  const [aprData, setAprData] = useState<
    PersonalizedAPRResponse["data"] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = useCallback(
    async ({ btcAmount, babyAmount }: CalculatorFormData) => {
      setLoading(true);
      setError(null);
      setAprData(null);

      try {
        const btcNumber = Number.parseFloat(btcAmount);
        const babyNumber = Number.parseFloat(babyAmount);

        const satoshis = btcToSatoshi(btcNumber);
        const ubbn = babyToUbbn(babyNumber);
        const result = await getPersonalizedAPR(satoshis, ubbn);
        setAprData(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to calculate APR";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return (
    <Content>
      <Card className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-6 bg-surface px-4 py-6 max-md:border-0">
        <Container
          as="main"
          className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-6"
        >
          <Section title="Co-Staking APR Calculator">
            <Text variant="body1" className="mb-6 text-accent-secondary">
              Enter your {btcSymbol} and {babySymbol} staking amounts to
              calculate your estimated co-staking APR.
            </Text>

            <Form<CalculatorFormData>
              schema={formSchema}
              onSubmit={handleCalculate}
              className="flex flex-col gap-4"
            >
              <NumberField
                name="btcAmount"
                label={`${btcSymbol} Amount`}
                placeholder="0.00"
                suffix={btcSymbol}
              />

              <NumberField
                name="babyAmount"
                label={`${babySymbol} Amount`}
                placeholder="0.00"
                suffix={babySymbol}
              />

              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                fluid
                disabled={loading}
              >
                {loading ? "Calculating..." : "Calculate APR"}
              </Button>
            </Form>

            {error && (
              <div className="mt-4 rounded-lg bg-error-light p-4">
                <Text variant="body2" className="text-error-main">
                  {error}
                </Text>
              </div>
            )}
          </Section>

          {aprData && (
            <Section title="Results">
              <div className="flex flex-col gap-4">
                <div className="bg-surface-highlight rounded-lg border border-primary-light/20 p-4">
                  <Heading variant="h6" className="mb-4 text-accent-primary">
                    Current APR
                  </Heading>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Text
                        variant="body2"
                        className="text-xs text-accent-secondary"
                      >
                        {btcSymbol} Staking
                      </Text>
                      <Text variant="body1" className="text-accent-primary">
                        {formatPercent(aprData.current?.btc_staking_apr)}
                      </Text>
                    </div>
                    <div>
                      <Text
                        variant="body2"
                        className="text-xs text-accent-secondary"
                      >
                        Co-Staking Bonus
                      </Text>
                      <Text variant="body1" className="text-accent-primary">
                        {formatPercent(aprData.current?.co_staking_apr)}
                      </Text>
                    </div>
                    <div>
                      <Text
                        variant="body2"
                        className="text-xs text-accent-secondary"
                      >
                        Total {btcSymbol} Staking APR
                      </Text>
                      <Text variant="body1" className="text-accent-primary">
                        {formatPercent(aprData.current?.total_apr)}
                      </Text>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-primary-light/10 pt-4">
                    <div>
                      <Text
                        variant="body2"
                        className="text-xs text-accent-secondary"
                      >
                        {babySymbol} Staking APR
                      </Text>
                      <Text variant="body1" className="text-accent-primary">
                        {formatPercent(aprData.current?.baby_staking_apr)}
                      </Text>
                    </div>
                  </div>
                </div>

                {(aprData.additional_baby_needed_for_boost ?? 0) > 0 && (
                  <div className="bg-surface-highlight rounded-lg border border-secondary-main/20 p-4">
                    <Heading variant="h6" className="mb-4 text-accent-primary">
                      Boost APR (with additional {babySymbol})
                    </Heading>
                    <Text
                      variant="body2"
                      className="mb-3 text-accent-secondary"
                    >
                      Stake{" "}
                      <span className="font-semibold text-secondary-main">
                        {aprData.additional_baby_needed_for_boost?.toLocaleString()}{" "}
                        {babySymbol}
                      </span>{" "}
                      more to unlock full co-staking rewards:
                    </Text>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Text
                          variant="body2"
                          className="text-xs text-accent-secondary"
                        >
                          {btcSymbol} Staking
                        </Text>
                        <Text variant="body1" className="text-accent-primary">
                          {formatPercent(aprData.boost?.btc_staking_apr)}
                        </Text>
                      </div>
                      <div>
                        <Text
                          variant="body2"
                          className="text-xs text-accent-secondary"
                        >
                          Co-Staking Bonus
                        </Text>
                        <Text variant="body1" className="text-accent-primary">
                          {formatPercent(aprData.boost?.co_staking_apr)}
                        </Text>
                      </div>
                      <div>
                        <Text
                          variant="body2"
                          className="text-xs text-accent-secondary"
                        >
                          Total {btcSymbol} Staking APR
                        </Text>
                        <Text
                          variant="body1"
                          className="font-semibold text-secondary-main"
                        >
                          {formatPercent(aprData.boost?.total_apr)}
                        </Text>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-secondary-main/10 pt-4">
                      <div>
                        <Text
                          variant="body2"
                          className="text-xs text-accent-secondary"
                        >
                          {babySymbol} Staking APR
                        </Text>
                        <Text variant="body1" className="text-accent-primary">
                          {formatPercent(aprData.boost?.baby_staking_apr)}
                        </Text>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}
        </Container>
      </Card>
    </Content>
  );
}
