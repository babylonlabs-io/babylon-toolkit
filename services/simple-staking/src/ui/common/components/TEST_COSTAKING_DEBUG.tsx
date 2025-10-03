/**
 * ⚠️ THROWAWAY TEST COMPONENT ⚠️
 * DELETE THIS FILE AFTER TESTING
 *
 * Purpose: Verify co-staking APR calculations (A%, B%, X)
 *
 * This component displays:
 * - A% (Current APR): Your actual APR right now
 * - B% (Boost APR): Your potential APR at 100% eligibility
 * - X (Additional BABY): How much more BABY to stake to reach 100%
 *
 * Calculation Method (POOL-SHARE MODEL):
 * ==========================================
 *
 * 1. Total Co-Staking Reward Supply (CASCADE FORMULA from PR #271):
 *    total_co_staking_reward_supply = annual_provisions
 *                                     × (1 - btc_portion - fp_portion)  // Remove incentives first
 *                                     × costaking_portion                // Then take co-staking share
 *
 *    This cascade calculation accounts for:
 *    - x/incentives module takes BTC staking & FP portions first
 *    - x/costaking module then takes from the remaining balance
 *    - Remaining balance goes to BABY staking (x/distribution)
 *
 * 2. User's Co-Staking APR:
 *    user_co_staking_apr = (user_total_score / global_total_score)
 *                          × total_co_staking_reward_supply
 *                          / user_active_baby
 *                          × 100
 *
 * 3. Final APRs:
 *    A% (Current) = btc_staking_apr + user_co_staking_apr
 *    B% (Boost)   = btc_staking_apr + boost_co_staking_apr (at 100% eligibility)
 *
 * Data Sources:
 * - user_total_score: from rewards_tracker.total_score (LCD)
 * - global_total_score: from current_rewards.total_score (LCD)
 * - total_co_staking_reward_supply: calculated using cascade formula (LCD)
 * - user_active_baby: from rewards_tracker.active_baby (LCD)
 *
 * Reference: PR #271 discussion & implementation
 */

import { useEffect } from "react";

import { useCoStakingService } from "../hooks/services/useCoStakingService";
import { useCosmosWallet } from "../context/wallet/CosmosWalletProvider";

export const TEST_COSTAKING_DEBUG = () => {
  const { bech32Address, connected } = useCosmosWallet();
  const {
    rewardsTracker,
    coStakingParams,
    aprData,
    currentRewards,
    rewardSupply,
    getCoStakingAPR,
    getAdditionalBabyNeeded,
    refreshCoStakingData,
    isLoading,
    error,
  } = useCoStakingService();

  useEffect(() => {
    if (isLoading) {
      console.log("🔄 Loading co-staking data...");
      return;
    }

    if (error) {
      console.error("❌ Error loading co-staking data:", error);
      return;
    }

    console.log("\n" + "=".repeat(80));
    console.log("🧪 CO-STAKING DEBUG DATA");
    console.log("=".repeat(80));

    // Wallet info
    console.log("\n🔌 WALLET INFO:");
    console.log("─".repeat(80));
    console.log("   Connected:", connected);
    console.log("   Address:", bech32Address || "N/A");
    console.log("   Queries Enabled:", Boolean(connected && bech32Address));

    // Raw data from APIs
    console.log("\n📊 RAW DATA FROM APIs:");
    console.log("─".repeat(80));

    console.log("\n1️⃣ LCD Rewards Tracker:");
    if (rewardsTracker) {
      console.log("   active_satoshis:", rewardsTracker.active_satoshis);
      console.log("   active_baby:", rewardsTracker.active_baby, "(ubbn)");
      console.log(
        "   active_baby:",
        Number(rewardsTracker.active_baby) / 1_000_000,
        "BABY",
      );
      console.log("   total_score:", rewardsTracker.total_score);
    } else {
      console.log("   ❌ No rewards tracker data");
    }

    console.log("\n2️⃣ Co-staking Params:");
    if (coStakingParams) {
      console.log(
        "   score_ratio_btc_by_baby:",
        coStakingParams.params.score_ratio_btc_by_baby,
      );
      console.log(
        "   costaking_portion:",
        coStakingParams.params.costaking_portion,
      );
    } else {
      console.log("   ❌ No params data");
    }

    console.log("\n3️⃣ APR Data from Backend:");
    if (aprData) {
      console.log("   btc_staking:", aprData.btc_staking + "%");
      console.log("   baby_staking:", aprData.baby_staking + "%");
      console.log("   co_staking:", aprData.co_staking + "%");
      console.log("   max_apr:", aprData.max_apr + "%");
    } else {
      console.log("   ❌ No APR data");
    }

    console.log("\n4️⃣ Current Co-Staking Rewards (Global):");
    if (currentRewards) {
      console.log("   period:", currentRewards.period);
      console.log("   total_score:", currentRewards.total_score);
      console.log("   rewards:", currentRewards.rewards, "ubbn");
    } else {
      console.log("   ❌ No current rewards data");
    }

    console.log("\n5️⃣ Annual Co-Staking Reward Supply (CASCADE FORMULA):");
    if (rewardSupply !== null && rewardSupply !== undefined) {
      console.log("   supply:", rewardSupply, "ubbn");
      console.log("   supply:", (rewardSupply / 1_000_000).toFixed(2), "BABY");
      console.log(
        "   Formula: annual_provisions × (1 - btc - fp) × costaking_portion",
      );
      console.log("   (Accounts for cascade: incentives → costaking → baby)");
    } else {
      console.log("   ❌ No reward supply data");
    }

    // Calculated values
    console.log("\n" + "=".repeat(80));
    console.log("🧮 CALCULATED VALUES:");
    console.log("─".repeat(80));

    const aprCalcs = getCoStakingAPR();
    const additionalBaby = getAdditionalBabyNeeded();

    console.log("\n📈 X - Additional BABY Needed:");
    console.log("   Value:", additionalBaby, "BABY");
    console.log(
      "   Meaning: Stake this much more BABY to reach 100% eligibility",
    );

    console.log("\n📊 A% - Current APR:");
    console.log("   Value:", aprCalcs.currentApr?.toFixed(2) + "%");
    console.log("   Meaning: What you're earning RIGHT NOW");
    console.log("   Formula: btc_apr + user_co_staking_apr (pool-share based)");

    console.log("\n🚀 B% - Boost APR:");
    console.log("   Value:", aprCalcs.boostApr?.toFixed(2) + "%");
    console.log("   Meaning: What you COULD earn at 100% eligibility");
    console.log(
      "   Formula: btc_apr + boost_co_staking_apr (at 100% eligibility)",
    );

    console.log("\n📊 Eligibility:");
    console.log("   Value:", aprCalcs.eligibilityPercentage.toFixed(2) + "%");
    console.log(
      "   Meaning: What % of your BTC is eligible for co-staking bonus",
    );

    // Manual verification
    console.log("\n" + "=".repeat(80));
    console.log("✅ MANUAL VERIFICATION:");
    console.log("─".repeat(80));

    if (rewardsTracker && coStakingParams && aprData) {
      const activeSats = Number(rewardsTracker.active_satoshis);
      const activeBaby = Number(rewardsTracker.active_baby);
      const scoreRatio = Number(coStakingParams.params.score_ratio_btc_by_baby);

      console.log("\n🔢 Basic calculations:");
      console.log("   1. Total BTC staked:", activeSats, "sats");
      console.log(
        "   2. BABY currently staked:",
        activeBaby,
        "ubbn =",
        (activeBaby / 1_000_000).toFixed(2),
        "BABY",
      );
      console.log("   3. Score ratio:", scoreRatio, "ubbn/sat");

      const requiredUbbn = activeSats * scoreRatio;
      console.log(
        "   4. BABY required for 100%:",
        requiredUbbn,
        "ubbn =",
        (requiredUbbn / 1_000_000).toFixed(2),
        "BABY",
      );

      const additionalUbbn = requiredUbbn - activeBaby;
      console.log(
        "   5. Additional needed:",
        additionalUbbn,
        "ubbn =",
        (additionalUbbn / 1_000_000).toFixed(2),
        "BABY",
      );
      console.log(
        "      ✓ X =",
        (additionalUbbn / 1_000_000).toFixed(2),
        "BABY",
      );

      const eligibleSats = Math.min(activeSats, activeBaby / scoreRatio);
      const eligibility = (eligibleSats / activeSats) * 100;
      console.log("\n   6. Eligible sats:", eligibleSats, "/ ", activeSats);
      console.log("   7. Eligibility:", eligibility.toFixed(2) + "%");

      // POOL-SHARE CALCULATION (THE ACTUAL METHOD)
      console.log("\n" + "─".repeat(80));
      console.log("🎯 POOL-SHARE APR CALCULATION");
      console.log("─".repeat(80));
      console.log("Using CASCADE formula for total_co_staking_reward_supply");

      if (
        currentRewards &&
        rewardSupply !== null &&
        rewardSupply !== undefined
      ) {
        const userScore = Number(rewardsTracker.total_score);
        const globalScore = Number(currentRewards.total_score);

        console.log("\n   Pool-share data:");
        console.log("      User's total score:", userScore);
        console.log("      Global total score:", globalScore);
        console.log(
          "      Annual reward supply:",
          rewardSupply,
          "ubbn =",
          (rewardSupply / 1_000_000).toFixed(2),
          "BABY",
        );

        if (globalScore > 0 && activeBaby > 0 && userScore > 0) {
          // Current APR calculation
          const poolShare = userScore / globalScore;
          const userAnnualRewards = poolShare * rewardSupply;
          const userCoStakingApr = (userAnnualRewards / activeBaby) * 100;
          const actualCurrentApr = aprData.btc_staking + userCoStakingApr;

          console.log("\n   Current APR (A%) - Pool-share:");
          console.log(
            "      Pool share: " + (poolShare * 100).toFixed(4) + "%",
          );
          console.log(
            "      User annual rewards: " +
              userAnnualRewards.toFixed(0) +
              " ubbn",
          );
          console.log(
            "      User co-staking APR: " + userCoStakingApr.toFixed(2) + "%",
          );
          console.log(
            "      = " +
              aprData.btc_staking +
              "% + " +
              userCoStakingApr.toFixed(2) +
              "%",
          );
          console.log("      ✓ A% = " + actualCurrentApr.toFixed(2) + "%");

          // Boost APR calculation (at 100% eligibility)
          const maxScore = activeSats; // At 100% eligibility, score = satoshis
          const boostPoolShare = maxScore / globalScore;
          const boostAnnualRewards = boostPoolShare * rewardSupply;
          const boostCoStakingApr = (boostAnnualRewards / requiredUbbn) * 100;
          const actualBoostApr = aprData.btc_staking + boostCoStakingApr;

          console.log("\n   Boost APR (B%) - Pool-share:");
          console.log(
            "      Max score (at 100%):",
            maxScore,
            "(= active_satoshis)",
          );
          console.log(
            "      Boost pool share: " +
              (boostPoolShare * 100).toFixed(4) +
              "%",
          );
          console.log(
            "      Boost annual rewards: " +
              boostAnnualRewards.toFixed(0) +
              " ubbn",
          );
          console.log(
            "      Boost co-staking APR: " + boostCoStakingApr.toFixed(2) + "%",
          );
          console.log(
            "      = " +
              aprData.btc_staking +
              "% + " +
              boostCoStakingApr.toFixed(2) +
              "%",
          );
          console.log("      ✓ B% = " + actualBoostApr.toFixed(2) + "%");
        } else {
          console.log(
            "\n   ⚠️  Cannot calculate: missing global score or active baby data",
          );
        }
      } else {
        console.log(
          "\n   ⚠️  Cannot calculate pool-share: missing currentRewards or rewardSupply",
        );
      }
    }

    // UI message
    console.log("\n" + "=".repeat(80));
    console.log("💬 UI MESSAGE:");
    console.log("─".repeat(80));
    if (aprCalcs.currentApr && aprCalcs.boostApr) {
      console.log(
        `\n   "Your current APR is ${aprCalcs.currentApr.toFixed(2)}%.`,
      );
      console.log(
        `   Stake ${additionalBaby.toFixed(2)} BABY to boost it up to ${aprCalcs.boostApr.toFixed(2)}%."`,
      );
    }

    console.log("\n" + "=".repeat(80));
    console.log("🏁 END DEBUG");
    console.log("=".repeat(80) + "\n");
  }, [
    rewardsTracker,
    coStakingParams,
    aprData,
    currentRewards,
    rewardSupply,
    getCoStakingAPR,
    getAdditionalBabyNeeded,
    isLoading,
    error,
    connected,
    bech32Address,
  ]);

  if (isLoading) {
    return (
      <div
        style={{ padding: "20px", border: "2px solid orange", margin: "20px" }}
      >
        <h2>🧪 CO-STAKING DEBUG (Loading...)</h2>
        <p>Check browser console for detailed logs</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px", border: "2px solid red", margin: "20px" }}>
        <h2>🧪 CO-STAKING DEBUG (Error)</h2>
        <pre>{JSON.stringify(error, null, 2)}</pre>
      </div>
    );
  }

  const aprCalcs = getCoStakingAPR();
  const additionalBaby = getAdditionalBabyNeeded();

  // Check data availability
  const dataAvailability = {
    aprData: !!aprData,
    rewardsTracker: !!rewardsTracker,
    coStakingParams: !!coStakingParams,
    hasCurrentApr: aprCalcs.currentApr !== null,
    hasBoostApr: aprCalcs.boostApr !== null,
  };

  return (
    <div
      style={{
        padding: "20px",
        border: "2px solid lime",
        margin: "20px",
        fontFamily: "monospace",
        fontSize: "14px",
      }}
    >
      <h2 style={{ marginTop: 0 }}>🧪 CO-STAKING DEBUG</h2>
      <p style={{ fontSize: "12px", color: "#666", marginBottom: "20px" }}>
        Check browser console for detailed calculations
      </p>

      {/* Wallet Status */}
      <div
        style={{
          marginBottom: "20px",
          padding: "10px",
          background: connected ? "#d4edda" : "#f8d7da",
          borderLeft: connected ? "4px solid #28a745" : "4px solid #dc3545",
        }}
      >
        <h3 style={{ marginTop: 0, fontSize: "16px" }}>🔌 Wallet Status:</h3>
        <ul
          style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "12px" }}
        >
          <li>
            {connected ? "✅" : "❌"} Connected: {connected ? "Yes" : "No"}
          </li>
          <li style={{ wordBreak: "break-all" }}>
            📍 Address: {bech32Address || <em>Not available</em>}
          </li>
          <li>
            🔄 Queries Enabled:{" "}
            {connected && bech32Address ? "✅ Yes" : "❌ No"}
          </li>
        </ul>
      </div>

      {/* Data Availability */}
      <div
        style={{
          marginBottom: "20px",
          padding: "10px",
          background: "#fff3cd",
          borderLeft: "4px solid #ffc107",
        }}
      >
        <h3 style={{ marginTop: 0, fontSize: "16px" }}>📊 Data Status:</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li>{dataAvailability.aprData ? "✅" : "❌"} APR Data (from API)</li>
          <li>
            {dataAvailability.rewardsTracker ? "✅" : "❌"} Rewards Tracker
            (from LCD)
          </li>
          <li>
            {dataAvailability.coStakingParams ? "✅" : "❌"} Co-Staking Params
            (from LCD)
          </li>
        </ul>
        <button
          onClick={() => refreshCoStakingData()}
          style={{
            marginTop: "10px",
            padding: "5px 10px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          🔄 Force Refresh All Data
        </button>
      </div>

      {/* Raw Data */}
      {(aprData || rewardsTracker || coStakingParams) && (
        <div
          style={{
            marginBottom: "20px",
            padding: "10px",
            background: "#e7f3ff",
            borderLeft: "4px solid #2196f3",
            fontSize: "12px",
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: "16px" }}>📋 Raw Data:</h3>

          {aprData && (
            <div style={{ marginBottom: "10px" }}>
              <strong>APR Data:</strong>
              <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
                <li>BTC Staking: {aprData.btc_staking}%</li>
                <li>Co-Staking: {aprData.co_staking}%</li>
                <li>Max APR: {aprData.max_apr}%</li>
              </ul>
            </div>
          )}

          {rewardsTracker && (
            <div style={{ marginBottom: "10px" }}>
              <strong>Rewards Tracker:</strong>
              <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
                <li>
                  Active Satoshis:{" "}
                  <strong>{rewardsTracker.active_satoshis}</strong>
                  {Number(rewardsTracker.active_satoshis) === 0 && (
                    <span style={{ color: "#f44336" }}> ⚠️ ZERO!</span>
                  )}
                </li>
                <li>
                  Active BABY:{" "}
                  <strong>
                    {(Number(rewardsTracker.active_baby) / 1_000_000).toFixed(
                      2,
                    )}{" "}
                    BABY
                  </strong>
                  {" (" + rewardsTracker.active_baby + " ubbn)"}
                </li>
                <li>
                  Total Score: <strong>{rewardsTracker.total_score}</strong>
                </li>
                <li
                  style={{ marginTop: "5px", fontSize: "11px", color: "#666" }}
                >
                  Raw JSON: <code>{JSON.stringify(rewardsTracker)}</code>
                </li>
              </ul>
            </div>
          )}

          {coStakingParams && (
            <div style={{ marginBottom: "10px" }}>
              <strong>Co-Staking Params:</strong>
              <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
                <li>
                  Score Ratio: {coStakingParams.params.score_ratio_btc_by_baby}{" "}
                  ubbn/sat
                </li>
              </ul>
            </div>
          )}

          {currentRewards && (
            <div style={{ marginBottom: "10px" }}>
              <strong>Current Rewards (Global):</strong>
              <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
                <li>Period: {currentRewards.period}</li>
                <li>Total Score: {currentRewards.total_score}</li>
                <li>
                  Rewards:{" "}
                  {currentRewards.rewards
                    .map((r) => `${r.amount} ${r.denom}`)
                    .join(", ")}
                </li>
              </ul>
            </div>
          )}

          {rewardSupply !== null && rewardSupply !== undefined && (
            <div>
              <strong>Annual Reward Supply:</strong>
              <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
                <li>
                  {rewardSupply} ubbn = {(rewardSupply / 1_000_000).toFixed(2)}{" "}
                  BABY
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <div
        style={{
          marginBottom: "20px",
          padding: "15px",
          background: "#f0f0f0",
          borderRadius: "4px",
        }}
      >
        <h3 style={{ marginTop: 0, fontSize: "18px" }}>🎯 Results:</h3>
        <div
          style={{
            display: "grid",
            gap: "10px",
            fontSize: "16px",
            fontWeight: "bold",
          }}
        >
          <div>
            <span style={{ color: "#666" }}>X (Additional BABY):</span>{" "}
            <span style={{ color: "#2196f3" }}>
              {additionalBaby.toFixed(2)} BABY
            </span>
          </div>
          <div>
            <span style={{ color: "#666" }}>A% (Current APR):</span>{" "}
            <span
              style={{
                color: dataAvailability.hasCurrentApr ? "#4caf50" : "#f44336",
              }}
            >
              {dataAvailability.hasCurrentApr
                ? `${aprCalcs.currentApr!.toFixed(2)}%`
                : "N/A"}
            </span>
          </div>
          <div>
            <span style={{ color: "#666" }}>B% (Boost APR):</span>{" "}
            <span
              style={{
                color: dataAvailability.hasBoostApr ? "#4caf50" : "#f44336",
              }}
            >
              {dataAvailability.hasBoostApr
                ? `${aprCalcs.boostApr!.toFixed(2)}%`
                : "N/A"}
            </span>
          </div>
          <div>
            <span style={{ color: "#666" }}>Eligibility:</span>{" "}
            <span style={{ color: "#ff9800" }}>
              {aprCalcs.eligibilityPercentage.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Pool-Share Breakdown */}
      {rewardsTracker &&
        currentRewards &&
        rewardSupply !== null &&
        rewardSupply !== undefined &&
        aprData && (
          <div
            style={{
              marginBottom: "20px",
              padding: "15px",
              background: "#f3e5f5",
              borderRadius: "4px",
              borderLeft: "4px solid #9c27b0",
              fontSize: "13px",
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: "16px" }}>
              🎯 Pool-Share APR Calculation (CASCADE Formula):
            </h3>
            <p
              style={{
                margin: "0 0 10px 0",
                fontSize: "12px",
                color: "#666",
              }}
            >
              Uses cascade formula: annual_provisions × (1 - btc - fp) ×
              costaking_portion
            </p>

            {(() => {
              const userScore = Number(rewardsTracker.total_score);
              const globalScore = Number(currentRewards.total_score);
              const activeBabyNum = Number(rewardsTracker.active_baby);
              const activeSatsNum = Number(rewardsTracker.active_satoshis);

              if (globalScore === 0 || activeBabyNum === 0 || userScore === 0) {
                return (
                  <p style={{ color: "#f44336" }}>
                    Cannot calculate: missing required data
                  </p>
                );
              }

              const poolShare = userScore / globalScore;
              const userAnnualRewards = poolShare * rewardSupply;
              const userCoStakingApr =
                (userAnnualRewards / activeBabyNum) * 100;

              return (
                <div>
                  <div
                    style={{
                      marginBottom: "10px",
                      padding: "8px",
                      background: "white",
                      borderRadius: "4px",
                    }}
                  >
                    <strong>Current APR (A%):</strong>
                    <div style={{ marginTop: "5px", fontSize: "12px" }}>
                      1. Your pool share = {userScore} / {globalScore} ={" "}
                      <strong>{(poolShare * 100).toFixed(4)}%</strong>
                    </div>
                    <div style={{ marginTop: "3px", fontSize: "12px" }}>
                      2. Your annual rewards = {(poolShare * 100).toFixed(4)}% ×{" "}
                      {(rewardSupply / 1_000_000).toFixed(2)} BABY ={" "}
                      <strong>
                        {(userAnnualRewards / 1_000_000).toFixed(4)} BABY
                      </strong>
                    </div>
                    <div style={{ marginTop: "3px", fontSize: "12px" }}>
                      3. Your co-staking APR ={" "}
                      {(userAnnualRewards / 1_000_000).toFixed(4)} /{" "}
                      {(activeBabyNum / 1_000_000).toFixed(2)} × 100 ={" "}
                      <strong>{userCoStakingApr.toFixed(2)}%</strong>
                    </div>
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "5px",
                        background: "#e8f5e9",
                        borderRadius: "3px",
                        fontSize: "14px",
                        fontWeight: "bold",
                      }}
                    >
                      A% = {aprData.btc_staking}% +{" "}
                      {userCoStakingApr.toFixed(2)}% ={" "}
                      {(aprData.btc_staking + userCoStakingApr).toFixed(2)}%
                    </div>
                  </div>

                  {(() => {
                    const scoreRatio = Number(
                      coStakingParams?.params.score_ratio_btc_by_baby || "0",
                    );
                    if (scoreRatio === 0) return null;

                    const requiredUbbn = activeSatsNum * scoreRatio;
                    const maxScore = activeSatsNum;
                    const boostPoolShare = maxScore / globalScore;
                    const boostAnnualRewards = boostPoolShare * rewardSupply;
                    const boostCoStakingApr =
                      (boostAnnualRewards / requiredUbbn) * 100;

                    return (
                      <div
                        style={{
                          padding: "8px",
                          background: "white",
                          borderRadius: "4px",
                        }}
                      >
                        <strong>Boost APR (B%) - at 100% eligibility:</strong>
                        <div style={{ marginTop: "5px", fontSize: "12px" }}>
                          1. Max score (at 100%) = {maxScore} (=
                          active_satoshis)
                        </div>
                        <div style={{ marginTop: "3px", fontSize: "12px" }}>
                          2. Boost pool share = {maxScore} / {globalScore} ={" "}
                          <strong>{(boostPoolShare * 100).toFixed(4)}%</strong>
                        </div>
                        <div style={{ marginTop: "3px", fontSize: "12px" }}>
                          3. Boost annual rewards ={" "}
                          {(boostPoolShare * 100).toFixed(4)}% ×{" "}
                          {(rewardSupply / 1_000_000).toFixed(2)} BABY ={" "}
                          <strong>
                            {(boostAnnualRewards / 1_000_000).toFixed(4)} BABY
                          </strong>
                        </div>
                        <div style={{ marginTop: "3px", fontSize: "12px" }}>
                          4. Required BABY for 100% ={" "}
                          {(requiredUbbn / 1_000_000).toFixed(2)} BABY
                        </div>
                        <div style={{ marginTop: "3px", fontSize: "12px" }}>
                          5. Boost co-staking APR ={" "}
                          {(boostAnnualRewards / 1_000_000).toFixed(4)} /{" "}
                          {(requiredUbbn / 1_000_000).toFixed(2)} × 100 ={" "}
                          <strong>{boostCoStakingApr.toFixed(2)}%</strong>
                        </div>
                        <div
                          style={{
                            marginTop: "8px",
                            padding: "5px",
                            background: "#e1f5fe",
                            borderRadius: "3px",
                            fontSize: "14px",
                            fontWeight: "bold",
                          }}
                        >
                          B% = {aprData.btc_staking}% +{" "}
                          {boostCoStakingApr.toFixed(2)}% ={" "}
                          {(aprData.btc_staking + boostCoStakingApr).toFixed(2)}
                          %
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        )}

      {/* UI Message */}
      {dataAvailability.hasCurrentApr && dataAvailability.hasBoostApr ? (
        <div
          style={{
            padding: "15px",
            background: "#e8f4f8",
            borderRadius: "4px",
            borderLeft: "4px solid #2196f3",
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: "16px" }}>💬 UI Message:</h3>
          <p style={{ fontSize: "16px", fontWeight: "bold", margin: 0 }}>
            Your current APR is {aprCalcs.currentApr!.toFixed(2)}%. Stake{" "}
            {additionalBaby.toFixed(2)} BABY to boost it up to{" "}
            {aprCalcs.boostApr!.toFixed(2)}%.
          </p>
        </div>
      ) : (
        <div
          style={{
            padding: "15px",
            background: "#ffebee",
            borderRadius: "4px",
            borderLeft: "4px solid #f44336",
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: "16px" }}>❌ Issue:</h3>
          <p style={{ margin: 0 }}>
            {aprCalcs.error || "Missing required data for APR calculation"}
          </p>
        </div>
      )}
    </div>
  );
};
