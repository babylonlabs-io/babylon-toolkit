/**
 * Centralized user-facing copy for the vault dApp.
 *
 * All user-visible text (labels, status messages, button text, step
 * descriptions, modal copy) lives here. Components and hooks should import
 * strings from this file rather than inlining them.
 *
 * Why a single file:
 * - One place to audit for English correctness and tone.
 * - Eliminates capitalization / phrasing drift across screens.
 * - Easier to wire up future i18n without hunting strings across the tree.
 *
 * Contract / on-chain error messages live in
 * `src/utils/errors/errorMessages.ts` because they are keyed by ABI error
 * name. Treat that file as part of "copy" for editing purposes.
 *
 * Style rules used here:
 * - "Pre-Pegin" (proper-noun form) for the broadcast phase / transaction.
 * - "peg-in" (lowercase, hyphenated) in regular prose.
 * - "vault provider" lowercase mid-sentence; capitalized only when
 *   sentence-leading.
 * - "BTC Vault" (capitalized, two words) when naming the product or a
 *   depositor's vault; never bare "vault". The "vault provider" /
 *   "vault keeper" role terms are the only exception.
 * - Status labels use sentence case (e.g. "Signing required").
 * - Past-tense broadcast statements use "has been broadcast", never bare
 *   "broadcast" as a participle.
 * - American English spelling (e.g. "acknowledgments", not
 *   "acknowledgements").
 * - Button labels are intentionally per-context: primary CTAs use Title
 *   Case (e.g. "Submit WOTS Key", "Broadcast Pre-Pegin", "Add BTC Vault"),
 *   while in-flow / dialog buttons use sentence case (e.g. "Activate",
 *   "Do not split", "View on blockchain explorer"). Match the
 *   surrounding screen rather than imposing a single rule.
 */

// Shared strings that legitimately appear in multiple places. Hoisting them
// here prevents wording drift if one site is later reworded but the other is
// missed.
const PRE_PEGIN_BROADCAST_CONFIRMATION_MESSAGE =
  "Your Bitcoin transaction has been broadcast to the network. It will be confirmed after receiving the required number of Bitcoin confirmations.";
const SOMETHING_WENT_WRONG_HEADING = "Something went wrong";

export const COPY = {
  pegin: {
    labels: {
      PENDING: "Pending",
      SIGNING_REQUIRED: "Signing required",
      AWAITING_KEY: "Awaiting key",
      PROCESSING: "Processing",
      READY_TO_ACTIVATE: "Ready to activate",
      AVAILABLE: "Available",
      IN_USE: "In use",
      REDEEM_IN_PROGRESS: "Redeem in progress",
      REDEEMED: "Redeemed",
      LIQUIDATED: "Liquidated",
      EXPIRED: "Expired",
      REFUNDING: "Refunding",
      FAILED: "Failed",
      INVALID: "Invalid",
      UNKNOWN: "Unknown",
    },
    messages: {
      payoutSignaturesSubmitted:
        "Payout signatures submitted. Vault provider is verifying and collecting acknowledgments...",
      awaitingWotsKey:
        "Vault provider is waiting for your WOTS public key. Click 'Submit WOTS Key' to continue.",
      broadcastMayHaveFailed:
        "Vault provider has not detected your deposit. The Pre-Pegin transaction may not have been broadcast. Click 'Broadcast' to retry.",
      payoutsReadyForSigning:
        "Vault provider has prepared payout transactions. Click 'Sign Payouts' to pre-authorize your Bitcoin claim transactions.",
      prePeginBroadcast:
        "Pre-Pegin transaction has been broadcast. Waiting for vault provider to detect your deposit...",
      waitingForDetection:
        "Waiting for vault provider to detect your deposit...",
      waitingForPayoutPrep:
        "Waiting for vault provider to prepare claim and payout transactions...",
      activationSubmitted:
        "BTC Vault activation submitted. Waiting for on-chain confirmation...",
      readyToActivate:
        "Bitcoin transaction confirmed. Reveal your HTLC secret to activate the BTC Vault.",
      inUseCannotRedeem:
        "BTC Vault is currently being used as collateral. Repay all debt before redeeming.",
      redemptionInProgress:
        "Your redemption is being processed. The vault provider is preparing your BTC withdrawal. This typically takes up to 3 days.",
      liquidated:
        "This BTC Vault was liquidated. The collateral was seized to cover unpaid debt.",
      refundBroadcast:
        "Refund transaction has been broadcast to Bitcoin. Waiting for on-chain confirmation...",
      invalid:
        "This BTC Vault is invalid. The BTC UTXOs were spent in a different transaction.",
      redemptionComplete:
        "Redemption complete. Your BTC has been returned to your wallet.",
    },
    primaryAction: {
      SUBMIT_WOTS_KEY: "Submit WOTS Key",
      SIGN_PAYOUT_TRANSACTIONS: "Sign Payouts",
      SIGN_AND_BROADCAST_TO_BITCOIN: "Broadcast Pre-Pegin",
      ACTIVATE_VAULT: "Activate",
      REFUND_HTLC: "Refund",
    },
    actionRequiredBadges: {
      SUBMIT_WOTS_KEY: "Key required",
      SIGN_PAYOUT_TRANSACTIONS: "Signing required",
      SIGN_AND_BROADCAST_TO_BITCOIN: "Broadcast required",
      ACTIVATE_VAULT: "Activation required",
      REFUND_HTLC: "Refund available",
    },
    expiration: {
      reasons: {
        ack_timeout: "The vault provider did not acknowledge in time",
        proof_timeout: "The inclusion proof was not submitted in time",
        activation_timeout: "The BTC Vault was not activated in time",
      },
      heading: "This BTC Vault has expired.",
      timeAgo: {
        justNow: "just now",
        prefix: "Expired",
      },
    },
    batchedDeposit: {
      groupLabel: "Batched deposit",
      broadcastHelper: "Broadcasts once for all BTC Vaults in this deposit",
    },
    progress: {
      stepCounter: (current: number, total: number) =>
        `Step ${current} of ${total}`,
    },
  },
  deposit: {
    steps: {
      generateSecret: "Generate secret for the deposit",
      signPeginBtc: "Sign the peg-in BTC transaction",
      signLinkProofs: "Sign proofs to link your Bitcoin and ETH addresses",
      signAndBroadcastEth: "Sign and broadcast ETH registration",
      signAndBroadcastPrePegin: "Sign and broadcast BTC Pre-Pegin transaction",
      awaitBtcConfirmation: "Awaiting Bitcoin confirmation",
      submitWotsKey: "Submit WOTS public key to vault provider",
      awaitPayoutTransactions:
        "Awaiting vault provider to prepare payout transactions",
      authenticateSession: "Authenticate session with vault provider",
      signPayouts: "Sign payout transactions",
      signRecoveryTxs: "Sign recovery transactions",
      awaitVpVerification: "Awaiting vault provider verification",
      downloadArtifact: "Download artifact",
      retrieveSecret: "Retrieve secret",
      revealSecret: "Sign and broadcast ETH activation transaction",
      awaitActivationConfirmation: "Awaiting vault activation confirmation",
      signingCounter: (completed: number, total: number) =>
        `(${completed} of ${total})`,
    },
    groups: {
      registerDeposit: "Register deposit",
      signWots: "Sign WOTS",
      signPayout: "Sign payout",
      activateVault: "Activate vault",
      stepCounter: (completed: number, total: number) =>
        `${completed}/${total}`,
    },
    // Screen-reader-only labels: the step/section status is otherwise conveyed
    // purely visually (spinner, checkmark, hollow circle).
    a11y: {
      stepActive: (number: number) => `Step ${number} active`,
      groupStatus: {
        completed: "Completed",
        active: "In progress",
        upcoming: "Not started",
      },
    },
    progress: {
      heading: "Deposit Progress",
      stepsCompleted: (completed: number, total: number) =>
        `${completed} of ${total} steps completed`,
      defaultSuccessMessage: PRE_PEGIN_BROADCAST_CONFIRMATION_MESSAGE,
      doNotSpendWarning:
        "Do not spend the Bitcoin used for this deposit until the transaction is confirmed on the network.",
      buttons: {
        closeContinueLater: "Close & continue later",
        retry: "Retry",
        close: "Close",
        done: "Done",
        sign: "Sign",
      },
    },
    btcConfirmation: {
      startedAt: "Started at",
      estRemaining: "Est. remaining",
      estRemainingValue: (minutes: number, blocksLeft: number) =>
        `~${minutes} min (${blocksLeft} BTC ${
          blocksLeft === 1 ? "block" : "blocks"
        })`,
      finalizing: "Finalizing...",
      bitcoinTx: "Bitcoin TX",
    },
    waitDetails: {
      startedAt: "Started at",
      status: "Status",
      preparingPayouts: "Preparing payout transactions",
      verifyingDeposit: "Verifying signatures and collecting ACKs",
      confirmingActivation: "Confirming activation",
    },
    broadcastSuccess: {
      heading: "Pre-Pegin Broadcast",
      body: (amount: string, symbol: string) =>
        `Your Pre-Pegin Bitcoin transaction for ${amount} ${symbol} has been broadcast to the network. Your BTC Vault is not active yet — this is just one step in the deposit lifecycle.`,
      footnote:
        "Once the Pre-Pegin confirms, the vault provider will prompt you to submit a WOTS key, sign payout authorizations, and finally activate the BTC Vault by revealing your HTLC secret. Check back here — the next required action will appear when it's ready.",
      doneButton: "Done",
    },
    refundSuccess: {
      heading: "Broadcasting Refund",
      body: "Refund transaction has been broadcast successfully.",
      viewExplorerButton: "View on blockchain explorer",
      doneButton: "Done",
      doNotSpendWarning: (symbol: string) =>
        `Do not spend the ${symbol} used for this deposit until the transactions are confirmed.`,
    },
    refundReview: {
      heading: "Review Refund",
      refundAmount: "Refund Amount",
      networkFeeRate: "Network Fee Rate",
      btcNetworkFee: "BTC Network Fee",
      youReceive: "You'll receive",
      challengePeriodInfo: (estimatedHours: number) =>
        `Refund arrives within the Bitcoin challenge period — approximately ${estimatedHours} hours after the transaction is confirmed.`,
      fallbackFeeWarning:
        "Could not fetch the mempool fee rate. The minimum relay fee may not get your refund confirmed. Set a fee rate above to continue.",
      dustError:
        "Network fee is too high — your refund would be below the Bitcoin dust limit. Lower the fee rate to continue.",
      retryButton: "Retry",
      confirmButton: "Confirm",
    },
    activateConfirmation: {
      title: "Activate your BTC Vault",
      body: "Activating your BTC Vault reveals the HTLC secret on Ethereum and finalizes your deposit. Before continuing, make sure you have downloaded your BTC Vault artifacts — these files let you independently claim your funds if the vault provider is unavailable.",
      alreadyDownloadedWarning:
        "We've already recorded that you downloaded artifacts for this BTC Vault from this browser. If you've since cleared site data or switched devices, download them again before activating.",
      notDownloadedWarning:
        "You haven't downloaded the artifacts for this BTC Vault yet on this browser. If you lose them and the vault provider goes offline, you will not be able to independently claim your funds.",
      riskAcknowledgement:
        "I understand the risk of activating without downloading my artifacts.",
      activateButton: "Activate",
      downloadArtifactsButton: "Download Artifacts",
      activateWithoutDownloadingButton: "Activate without downloading",
    },
    artifactDownload: {
      title: "Download BTC Vault Artifacts",
      body: "Before broadcasting your Bitcoin transaction, you need to download your BTC Vault artifacts. These files are required to independently claim your funds if the vault provider is unavailable.",
      storeSafelyWarning:
        "Store these files safely on your local disk or external drive. If you lose them and the vault provider goes offline, you will not be able to independently claim your funds.",
      downloadedBody:
        "Artifacts downloaded successfully. Please save the file to a safe location before continuing.",
      downloading: "Downloading...",
      downloadButton: "Download Artifacts",
      cancelButton: "Cancel",
      continueButton: "Continue",
      cannotAuthenticate:
        "Cannot authenticate with the vault provider. Please refresh and try again.",
    },
    form: {
      computingAllocation: "Computing allocation...",
      doNotSplit: "Do not split UTXO",
      selectVaultProvider: "Select Vault Provider",
      providerSelectDescription: "Choose a provider to secure your BTC",
      providerSelectEmpty: "No vault providers available at this time.",
      providerStatusActive: "Active",
      providerStatusUnavailable: "Unavailable",
      splitOptionDescription:
        "Split your BTC into multiple BTC Vaults for more flexibility. In liquidation, only part of your collateral may be affected.",
      noSplitOptionDescription:
        "Your BTC will be deposited into a single BTC Vault",
      learnWhyRecommended: "Learn why we recommend this.",
    },
    resume: {
      broadcastSuccessMessage: PRE_PEGIN_BROADCAST_CONFIRMATION_MESSAGE,
      activationSuccessMessage:
        "Your BTC Vault has been activated. The vault provider can now claim the HTLC on Bitcoin.",
      wotsMismatchError:
        "WOTS public key hash does not match the on-chain commitment — the wrong wallet is connected.",
    },
    errors: {
      invalidSecret:
        "Invalid secret: SHA256(secret) does not match the BTC Vault's hashlock. Please check your secret and try again.",
      chainSwitchRequired: (network: string) =>
        `Please switch to ${network} in your wallet`,
      ethereumMainnet: "Ethereum Mainnet",
      sepoliaTestnet: "Sepolia Testnet",
      crossDeviceBroadcastUnsupported:
        "This pre-peg-in cannot be broadcast from the in-app button because the build-time parameters that pin its Bitcoin scripts are not available here. Please broadcast from the original device, or wait for the refund timeout.",
    },
    payoutSigningGuards: {
      missingPayoutAddress: {
        title: "Missing Payout Address",
        message:
          "Depositor payout address not available. Please wait for indexer sync and try again.",
      },
      walletAddressUnavailable: {
        title: "Wallet Address Unavailable",
        message:
          "Connect the BTC wallet you used at deposit to verify the payout address before signing.",
      },
      walletAddressError: {
        title: "Wallet Address Error",
        message:
          "Could not read your Bitcoin wallet address. Please reconnect the wallet and make sure it is on the correct Bitcoin network.",
      },
      payoutAddressMismatch: {
        title: "Payout Address Mismatch",
        message:
          "The payout address from the indexer does not match your connected wallet. This may indicate a data integrity issue. Please verify your wallet connection.",
      },
      providerNotAssigned: {
        title: "Provider Not Assigned",
        message:
          "No vault provider is associated with this deposit. Please wait for indexer sync and try again.",
      },
      providerNotFound: {
        title: "Provider Not Found",
        message: "Vault provider not found.",
      },
      walletNotConnected: {
        title: "Wallet Not Connected",
        message: "BTC wallet not connected.",
      },
      missingPeginTransaction: {
        title: "Missing Pegin Transaction",
        message:
          "Pegin transaction hash not available yet. Please wait for indexer sync and try again.",
      },
    },
  },
  common: {
    loading: "Loading...",
    confirming: "Confirming...",
    applying: "Applying...",
    checking: "Checking...",
    somethingWentWrong: {
      heading: SOMETHING_WENT_WRONG_HEADING,
      body: "Please close this and try again in a moment.",
    },
    globalError: {
      heading: SOMETHING_WENT_WRONG_HEADING,
      body: "An unexpected error occurred. Please try again later.",
      retryButton: "Try again",
    },
  },
  wallet: {
    geoBlockedTooltip: "Not available in your region",
    walletNotEligibleTooltip: "Wallet not eligible",
    liveness: {
      errorTitle: "Wallet Not Responding",
      unresponsive:
        "Your BTC wallet is not responding. Please open your wallet extension to confirm it is unlocked and connected, then try again.",
      emptyAddress:
        "Your BTC wallet did not return an address. Please reconnect your wallet and try again.",
      addressMismatch:
        "Your BTC wallet account has changed. Please reconnect your wallet and try again.",
    },
  },
  collateral: {
    releaseDisabledTooltip:
      "No BTC Vault can be released without putting your position at risk of liquidation. Repay debt first.",
    releaseHfBreachTooltip: (threshold: number) =>
      `This selection would drop your health factor below ${threshold.toFixed(1)} and be rejected on-chain. Reduce the selection or repay debt first.`,
    uncapped: "Uncapped",
  },
  banner: {
    addVault: "Add BTC Vault",
    addCollateral: "Add Collateral",
    addVaultWithAmount: (amountBtc: string) => `Add ${amountBtc} BTC Vault`,
    addCollateralWithAmount: (amountBtc: string) =>
      `Add ${amountBtc} BTC Collateral`,
    applySuggestedOrder: "Apply Suggested Order",
  },
  reorder: {
    confirmButton: "Confirm",
  },
  protocolFees: {
    minDeposit: {
      label: "Min deposit",
      tooltip:
        "Minimum BTC deposit required to create a BTC Vault, set by the protocol.",
    },
    minForSplit: {
      label: "Effective minimum for split",
      tooltip:
        "Minimum deposit to split into 2 BTC Vaults. Both BTC Vaults must meet the minimum deposit requirement.",
    },
    ltv: {
      label: "LTV / Collateral Factor",
      tooltip:
        "Maximum percentage of collateral value that can be borrowed against.",
    },
    liquidationThreshold: {
      label: "Liquidation threshold (THF)",
      tooltip: "Target health factor at which liquidation becomes profitable.",
    },
    liquidationBonus: {
      label: "Liquidation Bonus (LB)",
      tooltip: "Bonus percentage awarded to liquidators on seized collateral.",
    },
  },
} as const;
