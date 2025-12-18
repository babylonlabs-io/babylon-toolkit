import { utils } from "@babylonlabs-io/babylon-proto-ts";
import { AminoTypes } from "@cosmjs/stargate";

/**
 * Creates Amino types for the Babylon simple-staking service.
 *
 * This function uses the shared amino converters from the babylon-proto-ts package,
 * which includes all necessary converters for:
 * - BTC staking operations (MsgCreateBTCDelegation, MsgBtcStakeExpand)
 * - BTC staking rewards (MsgWithdrawReward)
 * - BABY staking operations (MsgWrappedDelegate, MsgWrappedUndelegate)
 * - BABY staking rewards (MsgWithdrawDelegatorReward)
 *
 * These converters are required for Ledger hardware wallet support, as Ledger
 * devices use Amino JSON signing mode instead of Protobuf Direct signing.
 *
 * @returns AminoTypes instance configured with all Babylon message type converters
 */
export function createBbnAminoTypes(): AminoTypes {
  return new AminoTypes({
    ...utils.aminoConverters,
  });
}
