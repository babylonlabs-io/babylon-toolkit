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
// Generic deposit-failure title; shared so per-bucket titles can't drift.
const TRANSACTION_FAILED_TITLE = "Transaction failed";
// Shared between the resume WOTS error string and the mapped callout body so
// the wording stays in one place.
const WRONG_WALLET_BODY =
  "WOTS public key hash does not match the on-chain commitment — the wrong wallet is connected.";

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
    txHash: {
      // Row label for the dual Pegin / Pre-Pegin hash row on deposit and
      // collateral cards.
      label: "Transaction hash",
      // Row label for the single-hash row (withdraw section).
      singleLabel: "Transaction hash",
      // Inline prefixes for each hash in the dual row.
      pegin: "Peg-in:",
      prePegin: "Pre-Pegin:",
    },
    // Row label for the vault creation time (rendered as relative time).
    createdLabel: "Created",
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
        "Pre-Pegin transaction has been broadcast. Waiting for Bitcoin confirmation.",
      prePeginIngesting:
        "Pre-Pegin transaction confirmed. Waiting for vault provider to ingest your deposit.",
      waitingForDetection: "Waiting for vault provider to detect your deposit.",
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
      refundMaturing: (blocks: number, hours: number) =>
        `Refund claimable in ~${blocks} Bitcoin ${blocks === 1 ? "block" : "blocks"} (~${hours}h).`,
      refundMaturingUnknown: "Checking when your refund will be claimable...",
      invalid:
        "This BTC Vault is invalid. The BTC UTXOs were spent in a different transaction.",
      redemptionComplete:
        "Redemption complete. Your BTC has been returned to your wallet.",
    },
    statusErrors: {
      expired:
        "This deposit has expired. You may still reclaim within the grace window — see refund options.",
      expiredCleanedUp:
        "This deposit expired and the grace window has elapsed. No further action is possible.",
      expiredInClaim: "Deposit expired; claim transaction broadcast",
      invalidSigInContract:
        "Vault provider posted an invalid peg-in signature on-chain; this deposit cannot proceed.",
      amlRejected: "This deposit was rejected by AML screening.",
      ingestionRejected:
        "The vault provider could not ingest this deposit; it cannot proceed.",
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
      totalLabel: (amount: string, symbol: string) =>
        `${amount} ${symbol} total`,
    },
    warnings: {
      walletOwnershipMismatch: (truncatedPubkey: string) =>
        `This BTC Vault was created with a different BTC public key (${truncatedPubkey}). Switch to that wallet to perform actions.`,
    },
  },
  deposit: {
    steps: {
      generateSecret: "Generate secret for the deposit",
      signPeginBtc: "Sign the peg-in BTC transaction",
      signLinkProofs: "Sign proof to link your Bitcoin and ETH addresses",
      signAndBroadcastEth: "Sign and broadcast ETH registration",
      signAndBroadcastPrePegin: "Sign and broadcast BTC Pre-Pegin transaction",
      confirmingDeposit:
        "Awaiting Pre-Pegin inclusion (1 Bitcoin block · ~10 min)",
      submitWotsKey: "Set up Winternitz One-Time Signature (WOTS)",
      awaitPayoutTransactions: "Prepare claim and payout transactions",
      authenticateSession: "Authenticate session with vault provider",
      signPayouts: "Sign payout transactions",
      signRecoveryTxs: "Sign recovery transactions",
      awaitVpVerification: "Awaiting vault provider verification",
      retrieveSecret: "Retrieve secret",
      revealSecret: "Sign and broadcast ETH activation transaction",
      awaitActivationConfirmation: "Awaiting vault activation confirmation",
      peginFeeWarning: "Expect high transaction fee for security reasons",
      signingCounter: (completed: number, total: number) =>
        `(${completed} of ${total})`,
    },
    groups: {
      registerDeposit: "Register deposit",
      signWots: "Set up claim",
      signPayout: "Sign payout",
      activateVault: "Activate vault",
      stepCounter: (completed: number, total: number) =>
        `${completed}/${total}`,
    },
    // Screen-reader-only labels: the step/section status is otherwise conveyed
    // purely visually (spinner, checkmark, hollow circle).
    a11y: {
      stepActive: (number: number) => `Step ${number} active`,
      stepPending: (number: number) => `Step ${number} not started`,
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
      // Inline prefix for the pending-deposit card's active-step label
      // (e.g. "Step 6 of 15"). Sits before the bolded step label.
      stepPrefix: (current: number, total: number) =>
        `Step ${current} of ${total}`,
      defaultSuccessMessage: PRE_PEGIN_BROADCAST_CONFIRMATION_MESSAGE,
      doNotSpendWarning:
        "To ensure a seamless deposit, do not spend the BTC allocated for this process until the transaction is confirmed.",
      splitVaultColumnLabel: (vaultNumber: number) =>
        `BTC Vault ${vaultNumber}`,
      // Accessible label for the clickable deposit card / batched group, which
      // acts as a button opening the deposit multistepper.
      openDetailsAria: "Open deposit details",
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
      waitingForPayoutPrep:
        "Waiting for vault provider to prepare claim and payout transactions...",
      bitcoinTx: "Pre-Pegin Bitcoin transaction",
      // Compact summary rendered inline on PendingDepositCard during the
      // AWAIT_PAYOUT_TRANSACTIONS wait while BTC depth is still accruing.
      cardSummaryProgressing: (blocksLeft: number, minutes: number) =>
        `${blocksLeft} BTC ${
          blocksLeft === 1 ? "block" : "blocks"
        } · ~${minutes} min`,
    },
    waitDetails: {
      startedAt: "Started at",
      status: "Status",
      // Fallback status used at the AWAIT_PAYOUT_TRANSACTIONS step on the
      // resume path, when the live BTC confirmation counter is not wired in.
      // The active deposit flow shows the counter panel instead of this.
      awaitingBtcDepthAndVpSetup:
        "Awaiting Bitcoin confirmations and vault provider setup",
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
    refundNotBroadcast: {
      heading: "Nothing to refund",
      body: "Your Pre-Pegin transaction was never broadcast to Bitcoin. No BTC was locked, so there is nothing to refund.",
      doneButton: "Close",
      // Surfaced when the broadcast-time re-probe finds the Pre-PegIn
      // missing (preview was stale, mempool evicted the tx between
      // preview and confirm, etc.) — keeps the user from signing a
      // refund that would only fail at broadcast.
      broadcastGuardError:
        "Your Pre-Pegin transaction is no longer on Bitcoin. There is nothing to refund.",
    },
    refundReview: {
      heading: "Review Refund",
      refundAmount: "Refund Amount",
      networkFeeRate: "Network fee rate",
      btcNetworkFee: "BTC Network Fee",
      youReceive: "You'll receive",
      fallbackFeeWarning:
        "Could not fetch the mempool fee rate. The minimum relay fee may not get your refund confirmed. Set a fee rate above to continue.",
      dustError:
        "Network fee is too high — your refund would be below the Bitcoin dust limit. Lower the fee rate to continue.",
      retryButton: "Retry",
      confirmButton: "Confirm",
    },
    activateConfirmation: {
      title: "Activate your BTC Vault",
      body: "Before activating, download your BTC Vault artifacts. These files may be needed later to recover access to your BTC Vault.",
      riskAcknowledgement:
        "I understand the risks of continuing without the artifacts.",
      activateButton: "Activate Vault",
      cancelButton: "Cancel",
    },
    artifactDownload: {
      title: "Download BTC Vault artifacts",
      body: "Download your BTC Vault artifacts. These files are required to independently claim your funds if the vault provider is unavailable.",
      cancelButton: "Cancel",
      continueButton: "Continue",
    },
    recoveryArtifacts: {
      cardTitle: "Recovery artifacts",
      cardSubtitle: "Encrypted backup files",
      cardSize: "Up to ~1 GB",
      downloadButton: "Download Artifacts",
      downloadingButton: "Downloading...",
      cancelDownloadButton: "Cancel",
      downloadedLabel: "Downloaded",
      retryButton: "Retry",
      walletSignatureHint:
        "You may be asked to approve a signature in your wallet to authenticate.",
      cannotAuthenticate:
        "Cannot authenticate with the vault provider. Please refresh and try again.",
    },
    form: {
      computingAllocation: "Computing allocation...",
      maxTooltip: (opts: { hasSupplyCap: boolean }) =>
        opts.hasSupplyCap
          ? "Reserves a fee buffer, excludes inscription UTXOs, and stays within the supply cap."
          : "Reserves a fee buffer and excludes inscription UTXOs.",
      pendingConfirmationNotice: (amount: string) =>
        `${amount} pending confirmation`,
      pendingConfirmationTooltip:
        "Only balances confirmed in a Bitcoin block are shown here. This amount is still waiting to confirm.",
      doNotSplit: "Do not split UTXO",
      selectVaultProvider: "Select vault provider",
      providerSelectDescription: "Choose a provider to secure your BTC",
      providerSelectEmpty: "No vault providers available at this time.",
      providerStatusUnavailable: "Unavailable",
      // Status label for a vault provider that has recently been unreachable
      // per the health proxy. It stays selectable (health can recover).
      providerStatusUnhealthy: "Recently unreachable",
      // Tooltip on an unhealthy provider, explaining it stays selectable.
      providerUnhealthyReason:
        "This provider has recently been unreachable. You can still select it, but the deposit may need a retry.",
      // Divider label above the group of unhealthy / rejected providers.
      providerGroupUnavailableLabel: "Limited availability",
      // Per-provider metric labels shown in the picker.
      providerCommissionLabel: "Commission",
      providerActiveLabel: "Total locked",
      // Placeholder while a metric (commission, active BTC) is loading or
      // could not be fetched.
      providerMetricPlaceholder: "—",
      // Accessible label / tooltip for the per-provider explorer link.
      providerExplorerLinkLabel: "View vault provider on explorer",
      splitOptionDescription:
        "Split your BTC into multiple BTC Vaults for more flexibility. In liquidation, only part of your collateral may be affected.",
      noSplitOptionDescription:
        "Your BTC will be deposited into a single BTC Vault",
      learnWhyRecommended: "Learn why we recommend this.",
    },
    resume: {
      broadcastSuccessMessage: PRE_PEGIN_BROADCAST_CONFIRMATION_MESSAGE,
      activationSuccessMessage: "Your BTC Vault has been activated.",
      // Plural variant for a split deposit, shown once every BTC Vault in the
      // batch has been activated.
      activationSuccessMessagePlural: "Your BTC Vaults have been activated.",
      readyToActivateMessage:
        "Your payout transactions are signed and verified. Your BTC Vault is ready to activate.",
      wotsMismatchError: WRONG_WALLET_BODY,
    },
    warnings: {
      depositRecordNotSaved:
        "Your deposit was registered on-chain, but this browser couldn't save a local copy. Free up browser storage or exit private browsing so it shows up here for tracking.",
      reusesReservedUtxos: (count: number) =>
        count <= 1
          ? "This deposit and another of your pending BTC Vault deposits selected the same UTXOs. No BTC was committed in the other deposit, it will expire on its own."
          : `This deposit and ${count} of your other pending BTC Vault deposits selected the same UTXOs. No BTC was committed in the other deposits, they will expire on their own.`,
      wotsReadinessTimeout: (vaultNumber: number) =>
        `Vault ${vaultNumber}: WOTS key submission skipped - vault provider was not ready before the readiness timeout`,
      wotsReadinessTerminal: (vaultNumber: number) =>
        `Vault ${vaultNumber}: WOTS key submission skipped - vault provider reported this BTC Vault cannot continue`,
      payoutReadinessTerminal: (vaultNumber: number) =>
        `Vault ${vaultNumber}: Payout signing skipped - vault provider reported this BTC Vault cannot continue`,
      wotsSubmissionFailed: (vaultNumber: number, error: string) =>
        `Vault ${vaultNumber}: WOTS key submission failed - ${error}`,
      payoutSigningFailed: (vaultNumber: number, error: string) =>
        `Vault ${vaultNumber}: Payout signing failed - ${error}`,
      dismissReusesReservedUtxos: "Dismiss",
    },
    errors: {
      invalidSecret:
        "Invalid secret: SHA256(secret) does not match the BTC Vault's hashlock. Please check your secret and try again.",
      chainSwitchRequired: (network: string) =>
        `Please switch to ${network} in your wallet`,
      ethereumMainnet: "Ethereum Mainnet",
      sepoliaTestnet: "Sepolia Testnet",
      // ----------------------------------------------------------------------
      // Deposit-flow error callout copy (title + body). Consumed by
      // `mapDepositError` (utils/errors/depositErrors.ts). `defaultTitle` is the
      // generic fallback title shown in the error Callout; `genericBody` is the
      // fallback body only when the raw error is unrecognized and unsafe to show.
      // ----------------------------------------------------------------------
      defaultTitle: TRANSACTION_FAILED_TITLE,
      genericBody:
        "Something went wrong during your deposit. Please try again.",
      insufficientEthForGas: {
        title: TRANSACTION_FAILED_TITLE,
        body: "Your wallet doesn't have enough ETH to cover the network fee. Add more ETH and retry the transaction.",
      },
      signingRejected: {
        title: "Signing rejected",
        body: "You rejected the request in your wallet. Click Retry to approve it and continue.",
      },
      walletNotConnected: {
        title: "Wallet not connected",
        body: "Please reconnect your Bitcoin and Ethereum wallets, then try again.",
      },
      walletAccountChanged: {
        title: "Wallet account changed",
        body: "Your wallet account changed during the deposit. Please restart the deposit with the original account.",
      },
      utxosUnavailable: {
        title: "Bitcoin funds unavailable",
        body: "We couldn't confirm your Bitcoin funds are available. They may be in use by another deposit. Please try again in a moment.",
      },
      broadcastFailed: {
        title: "Broadcast failed",
        body: "We couldn't broadcast your Bitcoin transaction to the network. Please try again.",
      },
      providerNotFound: {
        title: "Vault provider not found",
        body: "The selected vault provider could not be found. Please refresh and try again.",
      },
      versionMismatch: {
        title: "Protocol parameters changed",
        body: "The protocol parameters changed while preparing your deposit. Please restart the deposit.",
      },
      wrongWalletAccount: {
        title: "Wrong wallet account",
        body: WRONG_WALLET_BODY,
      },
      // Vault-provider JSON-RPC error copy, consumed by `mapVpRpcError`
      // (utils/errors/formatting.ts). Title + message are both user-facing.
      vp: {
        syncing: {
          title: "Vault provider syncing",
          message:
            "The vault provider hasn't ingested your peg-in yet. Please wait a moment and try again.",
        },
        requestTimeout: {
          title: "Request timeout",
          message:
            "The vault provider took too long to respond. Please try again.",
        },
        providerNotFound: {
          title: "Provider not found",
          message:
            "The vault provider could not be found in the on-chain registry. It may have been deregistered.",
        },
        connectionFailed: {
          title: "Connection failed",
          message:
            "Unable to connect to the vault provider. Please check your connection and try again.",
        },
        providerTimeout: {
          title: "Provider timeout",
          message:
            "The vault provider took too long to respond. Please try again later.",
        },
        providerUnavailable: {
          title: "Provider unavailable",
          message:
            "The vault provider is temporarily unreachable. Please try again later.",
        },
        rejected: {
          title: "Signature submission failed",
          message: (code: number) =>
            `The vault provider rejected the request (error code: ${code}). Please try again or contact support.`,
        },
      },
    },
    payoutSigningGuards: {
      missingPayoutAddress: {
        title: "Missing payout address",
        message:
          "Depositor payout address not available. Please wait for indexer sync and try again.",
      },
      walletAddressUnavailable: {
        title: "Wallet address unavailable",
        message:
          "Connect the BTC wallet you used at deposit to verify the payout address before signing.",
      },
      walletAddressError: {
        title: "Wallet address error",
        message:
          "Could not read your Bitcoin wallet address. Please reconnect the wallet and make sure it is on the correct Bitcoin network.",
      },
      payoutAddressMismatch: {
        title: "Payout address mismatch",
        message:
          "The payout address from the indexer does not match your connected wallet. This may indicate a data integrity issue. Please verify your wallet connection.",
      },
      providerNotAssigned: {
        title: "Provider not assigned",
        message:
          "No vault provider is associated with this deposit. Please wait for indexer sync and try again.",
      },
      providerNotFound: {
        title: "Provider not found",
        message: "Vault provider not found.",
      },
      walletNotConnected: {
        title: "Wallet not connected",
        message: "BTC wallet not connected.",
      },
      missingPeginTransaction: {
        title: "Missing peg-in transaction",
        message:
          "Peg-in transaction hash is not available yet. Please wait for indexer sync and try again.",
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
    // Friendly copy for known viem / EIP-1193 / wallet-connector failure
    // categories. Consumed by `sanitizeErrorMessage` in
    // `src/utils/errors/formatting.ts`. Cross-feature surface (deposit,
    // refund, activation) so lives under `common` rather than `deposit`.
    classifiedErrors: {
      userRejection:
        "Transaction rejected in your wallet. No changes were made — try again when you're ready.",
      insufficientFunds:
        "Not enough ETH to cover the deposit fee and gas. Add ETH to your wallet and try again.",
      walletDisconnected:
        "Your wallet was disconnected. Reconnect it and try again.",
      unauthorized:
        "This site isn't authorized in your wallet. Approve the connection and try again.",
      chainSwitchFailed:
        "Couldn't switch your wallet to the required network. Switch chains manually and try again.",
      receiptTimeout:
        "We couldn't confirm your transaction. Check your wallet or a block explorer for the latest status.",
      network: "Network error. Check your connection and try again.",
      staleDeploy:
        "This page is out of date — a newer version of the app was deployed. Refresh the page and try again.",
    },
  },
  wallet: {
    geoBlockedTooltip: "Not available in your region",
    walletNotEligibleTooltip: "Wallet not eligible",
    liveness: {
      errorTitle: "Wallet not responding",
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
    empty: {
      title: "Deposit Bitcoin to get started",
      body: (symbol: string) =>
        `Add ${symbol} as collateral so you can begin borrowing assets.`,
    },
  },
  withdraw: {
    // Shared labels (review + initiated screens).
    estimatedTimeLabel: "Estimated time until payout",
    nominatedAddressLabel: "Nominated address",
    initiated: {
      title: "Withdrawal initiated",
      // Describes the real claim -> challenge period -> payout path.
      body: "Your withdrawal has been submitted. The vault provider will broadcast a claim transaction on Bitcoin; after a challenge period, your BTC will be sent to your nominated address.",
      doneButton: "Done",
    },
  },
  // Peg-out (withdrawal) progress — status badges/messages on the Pending
  // Withdraw card, plus the live payout countdown and claim/assert tx labels.
  pegout: {
    status: {
      claimEventReceived: {
        label: "Processing",
        message:
          "Your withdrawal request has been received and is being processed.",
      },
      claimBroadcast: {
        label: "Processing",
        message:
          "Your withdrawal is in progress. A claim transaction has been broadcast to Bitcoin.",
      },
      assertBroadcast: {
        label: "Confirming",
        message:
          "Your withdrawal is going through its on-chain challenge period before the BTC payout can be broadcast.",
      },
      payoutBroadcast: {
        label: "BTC Sent",
        message: "Your BTC has been sent to your nominated address.",
      },
      payoutBlocked: {
        label: "Blocked",
        message:
          "Withdrawal was blocked on-chain (challenger or council override). Please contact support.",
      },
      initiating: {
        label: "Initiating",
        message: "Your withdrawal is being prepared by the vault provider.",
      },
      unavailable: {
        label: "Status Unavailable",
        message:
          "Unable to determine withdrawal status. The vault provider may be unreachable. Please try again later or contact support.",
      },
      unknownLabel: "Unknown",
      unknownMessage: (status: string) =>
        `Unknown status: ${status}. Please contact support.`,
    },
    // Live countdown shown while the withdrawal is in its challenge period.
    payoutEta: (duration: string) => `~${duration} until payout`,
    payoutImminent: "Payout available shortly",
    // Shown under the amount while the VP has not yet initiated the withdrawal.
    awaitingInitiation:
      "Waiting for the vault provider to start the withdrawal",
    txHash: {
      // "Withdrawal" (not "Transaction hash") to distinguish from the deposit
      // peg-in/Pre-Pegin row shown on the same pending-withdraw card.
      label: "Withdrawal",
      claimLabel: "Claim:",
      assertLabel: "Assert:",
    },
  },
  loans: {
    heading: "Loans",
    borrowButton: "Borrow",
    repayButton: "Repay",
    borrowRateLabel: "Borrow rate",
    detailsAriaLabel: (symbol: string) => `${symbol} loan details`,
    empty: {
      title: (symbol: string) => `Borrow assets using your ${symbol}`,
      body: (symbol: string) =>
        `Deposit ${symbol} as collateral to start borrowing.`,
    },
  },
  overview: {
    heading: "Overview",
    healthFactorLabel: "Health factor",
    ltvLabel: "Current LTV",
    totalCollateralValueLabel: "Total collateral value",
    amountToRepayLabel: "Amount to repay",
    disconnected: {
      heroTitle: "Native Bitcoin backed borrowing",
      heroBody:
        "Powered by Babylon Trustless Bitcoin Vault protocol, collateralize native Bitcoin and borrow stablecoins or wBTC directly from Aave V4.",
      connectButton: "Connect Wallet",
      aprLabels: {
        usdt: "USDT APR",
        usdc: "USDC APR",
        wbtc: "wBTC APR",
      },
      steps: {
        speed: {
          title: "Get stables in ~2 hours",
          caption: "Fast loan processing",
        },
        rates: {
          title: "Best borrowing rates",
          caption: "Access liquidity via Aave V4",
        },
        trustless: {
          title: "Trustless & permissionless",
          caption: "No approvals / intermediaries",
        },
        native: {
          title: "No bridging needed",
          caption: "Native Bitcoin, no wrapping",
        },
      },
    },
  },
  activity: {
    pageTitle: "Activity",
    filterAll: "Show all",
    // Visible filter options in dropdown order (matches Figma node 6602-64485).
    // Redeem / Pending Deposit rows still render but are not filterable —
    // they don't appear here on purpose.
    filterTypes: {
      Deposit: "Deposits",
      Withdraw: "Withdrawals",
      Repay: "Repaid",
      Borrow: "Borrowed",
      "Partially Liquidated": "Partially Liquidated",
      "Fully Liquidated": "Fully Liquidated",
    },
    hashPending: "Pending…",
    refundedTooltip: "Transaction was refunded",
    // Labels for the two child rows nested inside a LiquidationGroupRow.
    liquidation: {
      collateralLabel: "Collateral Liquidated",
      repaidLabel: "Loan Repaid",
    },
    emptyDisconnected: "Connect your wallet to view your activity",
    emptyConnected: "No activity yet. Make your first deposit to get started.",
    emptyFiltered: "No activity",
    depositCta: (coinSymbol: string) => `Deposit ${coinSymbol}`,
  },
  banner: {
    addCollateral: "Add Collateral",
    repayDebt: "Repay Debt",
    applySuggestedOrder: "Apply Suggested Order",
  },
  geoBlock: {
    title: "Service unavailable in your region",
    body: "We're unable to provide access from your current region due to regulatory restrictions.",
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
  // Liquidation-notification warnings shown in the position banner. Mirrors the
  // three warning types produced by the calculator (urgent / dust / weird-params).
  liquidationWarnings: {
    urgent: {
      liquidatableTitle: "Liquidation can trigger now",
      liquidatableDetail: (liqPriceUsd: string) =>
        `BTC has dropped below your liquidation price ($${liqPriceUsd}). Anyone can liquidate your position at any moment.`,
      liquidatableSuggestion:
        "Add more BTC or repay debt immediately to bring your health factor back above 1.0.",
      approachingTitle: (distancePct: string) =>
        `Liquidation is ${distancePct}% away`,
      approachingDetail: (liqPriceUsd: string, distancePct: string) =>
        `A drop to $${liqPriceUsd} (just ${distancePct}% lower than now) triggers your first liquidation event.`,
      approachingSuggestion:
        "Add collateral or repay part of the debt to reduce your liquidation risk.",
    },
    // Standalone reorder suggestion (not a risk warning). Surfaced whenever the
    // engine finds a safer liquidation order than the current on-chain order.
    reorder: {
      title: "BTC Vaults aren't in the safest liquidation order",
      detail:
        "Reordering puts a smaller BTC Vault first so less collateral is seized in the first liquidation event. Apply the suggested order to improve your partial-liquidation protection.",
    },
    dust: {
      title: "Position too small to model",
      detail:
        "Below $1,000 the cascade simplifies — all BTC Vaults are shown as one liquidation event. Small positions don't have meaningful multi-event behavior.",
    },
    weirdParams: {
      title: "Protocol parameters don't compute",
      causeLiqPenalty: (liqPenalty: string, thf: string) =>
        `maxLB × CF = ${liqPenalty}, but it must be less than THF (${thf}). At this combination the liquidation formula becomes undefined (division by a non-positive number).`,
      causeThfTooLow: (thf: string, expectedHf: string) =>
        `THF (${thf}) must be greater than expected HF (${expectedHf}) — otherwise liquidation has no valid target.`,
      causeFractionOver: (fractionPct: string) =>
        `With these settings, each liquidation would seize more than 100% of your collateral (${fractionPct}%). That's mathematically impossible — adjust CF, THF, or maxLB.`,
      causeGeneric: (fractionPct: string) =>
        `Seizure fraction computed as ${fractionPct}% — outside the valid range. Adjust CF, THF, or maxLB.`,
    },
  },
} as const;
