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
 * - Status labels use sentence case (e.g. "Signing required").
 * - Past-tense broadcast statements use "has been broadcast", never bare
 *   "broadcast" as a participle.
 * - American English spelling (e.g. "acknowledgments", not
 *   "acknowledgements").
 */

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
        "Vault activation submitted. Waiting for on-chain confirmation...",
      readyToActivate:
        "Bitcoin transaction confirmed. Reveal your HTLC secret to activate the vault.",
      inUseCannotRedeem:
        "Vault is currently being used as collateral. Repay all debt before redeeming.",
      redemptionInProgress:
        "Your redemption is being processed. The vault provider is preparing your BTC withdrawal. This typically takes up to 3 days.",
      liquidated:
        "This vault was liquidated. The collateral was seized to cover unpaid debt.",
      refundBroadcast:
        "Refund transaction has been broadcast to Bitcoin. Waiting for on-chain confirmation...",
      invalid:
        "This vault is invalid. The BTC UTXOs were spent in a different transaction.",
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
        activation_timeout: "The vault was not activated in time",
      },
      heading: "This vault has expired.",
      timeAgo: {
        justNow: "just now",
        prefix: "Expired",
      },
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
      awaitBtcConfirmationDuration: "(~15 min)",
      submitWotsKey: "Submit WOTS public key to vault provider",
      authenticateSession: "Authenticate session with vault provider",
      signPayouts: "Sign payout transactions",
      downloadArtifact: "Download artifact",
      revealSecret: "Sign and broadcast reveal secret",
    },
    stepDescriptions: {
      deriveVaultSecret:
        "Approve the deterministic signature in your BTC wallet to derive your vault's HTLC secret.",
      signPeginBtc: "Sign the peg-in transaction in your BTC wallet.",
      signPop: "Please sign the proof of possession (PoP) in your BTC wallet.",
      submitPegin:
        "Please sign and submit the peg-in transaction in your ETH wallet.",
      broadcastPrePeginActive:
        "Please sign the Pre-Pegin transaction in your BTC wallet. It will be broadcast to Bitcoin immediately after.",
      awaitBtcConfirmation:
        "Waiting for Bitcoin to confirm the Pre-Pegin transaction...",
      submitWotsActive:
        "Submitting your WOTS public key to the vault provider.",
      submitWotsWaiting:
        "Waiting for the vault provider to prepare payout transactions...",
      signAuthAnchor:
        "Approve the deterministic signature in your BTC wallet to authenticate with the vault provider.",
      signPayoutsActive:
        "Please sign the payout transaction(s) in your BTC wallet.",
      signPayoutsWaiting:
        "Waiting for the vault provider to prepare payout transaction(s)...",
      artifactDownloadActive:
        "Download your vault artifacts before continuing.",
      artifactDownloadWaiting:
        "Waiting for the vault provider to verify your deposit on-chain...",
      activateVaultActive:
        "Revealing HTLC secret on Ethereum to activate the vault.",
      activateVaultWaiting: "Waiting for on-chain verification...",
      completed: "Deposit successfully submitted!",
    },
    progress: {
      heading: "Deposit Progress",
      durationEstimate: "(~60 min)",
      defaultSuccessMessage:
        "Your Bitcoin transaction has been broadcast to the network. It will be confirmed after receiving the required number of Bitcoin confirmations.",
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
    broadcastSuccess: {
      heading: "Pre-Pegin Broadcast",
      body: (amount: string, symbol: string) =>
        `Your Pre-Pegin Bitcoin transaction for ${amount} ${symbol} has been broadcast to the network. Your vault is not active yet — this is just one step in the deposit lifecycle.`,
      footnote:
        "Once the Pre-Pegin confirms, the vault provider will prompt you to submit a WOTS key, sign payout authorizations, and finally activate the vault by revealing your HTLC secret. Check back here — the next required action will appear when it's ready.",
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
  },
} as const;
