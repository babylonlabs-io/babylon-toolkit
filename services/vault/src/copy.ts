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

// Direct file import (not the barrel) so we don't pull errorMessages' siblings
// that import this file back. errorMessages.ts is import-free, so this is safe.
import type { ActivityType } from "@/types/activityLog";
import { CONTRACT_ERROR_MESSAGES } from "@/utils/errors/errorMessages";

// Shared strings that legitimately appear in multiple places. Hoisting them
// here prevents wording drift if one site is later reworded but the other is
// missed.
const PRE_PEGIN_BROADCAST_CONFIRMATION_MESSAGE =
  "Your Bitcoin transaction has been broadcast to the network. It will be confirmed after receiving the required number of Bitcoin confirmations.";
const SOMETHING_WENT_WRONG_HEADING = "Something went wrong";
// Disconnected empty state on every v3 tab (Vaults / Loans / Activity). One
// builder so the three can't drift apart.
const connectToView = (subject: string) =>
  `Connect your wallet to view your ${subject}`;
// Generic deposit-failure title; shared so per-bucket titles can't drift.
const TRANSACTION_FAILED_TITLE = "Transaction failed";
// Shared between the resume WOTS error string and the mapped callout body so
// the wording stays in one place.
const WRONG_WALLET_BODY =
  "WOTS public key hash does not match the on-chain commitment — the wrong wallet is connected.";
// Action-required labels shared between the in-app badges
// (`pegin.actionRequiredBadges`) and the browser-notification titles so the two
// surfaces can't drift.
const KEY_REQUIRED_LABEL = "Key required";
const SIGNING_REQUIRED_LABEL = "Signing required";
const BROADCAST_REQUIRED_LABEL = "Broadcast required";
const ACTIVATION_REQUIRED_LABEL = "Activation required";
const WITHDRAW_REQUIRED_LABEL = "Withdraw required";
// Depositor-facing name for the multi-vault deposit option. Shared between the
// split-option title and the "deposit too low" hint so the two never drift.
const TWO_VAULT_SPLIT_NAME = "Two-vault split";
// In-place cancel action for an in-flight artifact download, shared by the
// artifact-download and activate-confirmation dialog footers so the two
// can't drift.
const CANCEL_DOWNLOAD_LABEL = "Cancel download";
// Wallet-signature action/status label, shared by the deposit-stepper button
// and the recovery-artifacts card status so the two can't drift.
const SIGN_TRANSACTION_LABEL = "Sign Transaction";
// Downloaded-state heading/body of the artifact dialogs, shared by the
// standalone download dialog and the activate-confirmation dialog so the
// two can't drift.
const ARTIFACTS_DOWNLOADED_TITLE = "Artifacts downloaded";
const ARTIFACTS_DOWNLOADED_BODY =
  "Your files are stored locally and never uploaded.";

/**
 * A run of modal body text. `emphasis` segments render in the primary text
 * color (e.g. a repaid amount or a key instruction), the rest in secondary —
 * so a single line can mix muted prose with highlighted phrases.
 */
export interface EmphasisBodySegment {
  text: string;
  emphasis: boolean;
}

export const COPY = {
  pegin: {
    labels: {
      PENDING: "Pending",
      SIGNING_REQUIRED: "Signing required",
      AWAITING_KEY: "Awaiting key",
      PROCESSING: "Processing",
      READY_TO_ACTIVATE: "Ready to activate",
      ACTIVATION_INCOMPLETE: "Activation incomplete",
      AVAILABLE: "Available",
      IN_USE: "In use",
      REDEEM_IN_PROGRESS: "Redeem in progress",
      REDEEMED: "Redeemed",
      LIQUIDATED: "Liquidated",
      EXPIRED: "Expired",
      REFUNDING: "Refunding",
      REFUNDED: "Refunded",
      FAILED: "Failed",
      INVALID: "Invalid",
      UNKNOWN: "Unknown",
    },
    txHash: {
      // Row label for the dual Pegin / Pre-Pegin hash row on deposit and
      // collateral cards.
      label: "Transaction hash",
      // Inline prefixes for each hash in the dual row.
      pegin: "Peg-in:",
      prePegin: "Pre-Pegin:",
    },
    // Shown if activation is attempted while the protocol is paused — surfaced
    // as the activation error so the spinner clears and the user understands
    // it's a governance pause (not a failed secret). Activation resumes on unpause.
    activationPaused:
      "Activation is paused by a protocol governance action. Your BTC Vault stays safe — activation will resume once the pause is lifted.",
    // Same shape for the activate-and-redeem escape hatch, which is gated only
    // by a protocol-scope pause (an application pause never blocks it).
    activateAndRedeemPaused:
      "Withdrawal is paused by a protocol governance action. Your BTC Vault stays safe — withdrawal will resume once the pause is lifted.",
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
      // Deliberately reassuring: this state looks alarming but the BTC is
      // recoverable. Lead with that before explaining what happened.
      activationIncomplete:
        "Your BTC is not lost. The peg-in was completed on Bitcoin, but the BTC Vault was never activated. Click 'Withdraw' and the vault provider will send your BTC to your payout address.",
      // Always-visible one-liner under the amount (the message above is
      // tooltip-only); same reassuring tone.
      activationIncompleteSubtext:
        "Your BTC is not lost — withdraw to receive it back.",
      inUseCannotRedeem:
        "BTC Vault is currently being used as collateral. Repay all debt before redeeming.",
      redemptionInProgress:
        "Your redemption is being processed. The vault provider is preparing your BTC withdrawal. This typically takes up to 3 days.",
      liquidated:
        "This BTC Vault was liquidated. The collateral was seized to cover unpaid debt.",
      refundBroadcast:
        "Refund transaction has been broadcast to Bitcoin. Waiting for on-chain confirmation...",
      refundComplete:
        "Your refund has been confirmed on Bitcoin. The locked BTC has returned to your wallet.",
      // Longest sub-line the lifecycle rows render, so it sizes
      // LIST_ROW_LEADING_COLUMN_CLASS's basis (components/shared/ListRow.tsx).
      // Lengthening it here ellipses that cell unless the basis moves too.
      refundMaturing: (blocks: number, hours: number) =>
        `Your refund will be claimable in ~${blocks} Bitcoin ${blocks === 1 ? "block" : "blocks"} (~${hours}h).`,
      refundMaturingUnknown: "Checking when your refund will be claimable...",
      invalid:
        "This BTC Vault is invalid. The BTC UTXOs were spent in a different transaction.",
      redemptionComplete:
        "Redemption complete. Your BTC payout has been sent to your nominated address.",
    },
    statusErrors: {
      expired:
        "This deposit has expired. You may still refund within the grace window.",
      expiredCleanedUp:
        "This deposit expired and the grace window has elapsed. No further action is possible.",
      expiredInClaim: "Deposit expired; claim transaction has been broadcast",
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
      ACTIVATE_AND_REDEEM: "Withdraw",
      REFUND_HTLC: "Refund",
    },
    actionRequiredBadges: {
      SUBMIT_WOTS_KEY: KEY_REQUIRED_LABEL,
      SIGN_PAYOUT_TRANSACTIONS: SIGNING_REQUIRED_LABEL,
      SIGN_AND_BROADCAST_TO_BITCOIN: BROADCAST_REQUIRED_LABEL,
      ACTIVATE_VAULT: ACTIVATION_REQUIRED_LABEL,
      ACTIVATE_AND_REDEEM: WITHDRAW_REQUIRED_LABEL,
      REFUND_HTLC: "Refund available",
    },
    expiration: {
      reasons: {
        // The acknowledgment window can lapse because the depositor never
        // finished their side (for example, never signed the payouts), not
        // only because the vault provider was late. Naming a cause would
        // often be wrong, so these vaults show the heading alone.
        ack_timeout: null,
        proof_timeout: "The inclusion proof was not submitted in time",
        activation_timeout: "The BTC Vault was not activated in time",
      },
      heading: "This BTC Vault has expired.",
      timeAgo: {
        justNow: "just now",
        prefix: "Expired",
      },
    },
    warnings: {
      walletOwnershipMismatch: (truncatedPubkey: string) =>
        `This BTC Vault was created with a different BTC public key (${truncatedPubkey}). Switch to that wallet to perform actions.`,
    },
  },
  deposit: {
    disabled: {
      title: "Deposits temporarily unavailable",
      description: "Deposits are currently disabled. Please try again later.",
      bannerMessage:
        "New deposits are paused for maintenance and will resume shortly.",
    },
    maxVaultsReached: {
      cta: "Maximum BTC Vaults reached",
      unavailableCta: "Unable to verify BTC Vault count — please try again",
      splitUnavailable: (used: number, cap: number) =>
        `${used} of ${cap} BTC Vaults used. BTC Vault split unavailable.`,
    },
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
      awaitActivationConfirmation: "Awaiting BTC Vault activation confirmation",
      peginFeeWarning: "Expect a high transaction fee for security reasons",
      signingCounter: (completed: number, total: number) =>
        `(${completed} of ${total})`,
    },
    // Browser (desktop) notifications fired when a deposit needs the depositor
    // to sign or act while the tab is in the background. `title` is the bold
    // heading; `body` is the line beneath it. Titles reuse the same constants as
    // the in-app action badges (`pegin.actionRequiredBadges`) so the two
    // surfaces can't drift. Bodies are kept short because the OS truncates long
    // notification text.
    notifications: {
      deriveVaultSecret: {
        title: SIGNING_REQUIRED_LABEL,
        body: "Approve the request in your wallet to generate your deposit secret.",
      },
      signPeginBtc: {
        title: SIGNING_REQUIRED_LABEL,
        body: "Approve the peg-in transaction in your wallet to continue your deposit.",
      },
      signPop: {
        title: SIGNING_REQUIRED_LABEL,
        body: "Sign the ownership proof in your wallet to continue your deposit.",
      },
      submitPegin: {
        title: SIGNING_REQUIRED_LABEL,
        body: "Confirm the registration in your wallet to continue your deposit.",
      },
      submitWotsKey: {
        title: KEY_REQUIRED_LABEL,
        body: "Your deposit is ready - submit your WOTS key to continue.",
      },
      signPayouts: {
        title: SIGNING_REQUIRED_LABEL,
        body: "Your vault provider has prepared your payout transactions - sign them to continue.",
      },
      signAndBroadcast: {
        title: BROADCAST_REQUIRED_LABEL,
        body: "Your deposit is registered - broadcast the Pre-Pegin transaction to continue.",
      },
      activateVault: {
        title: ACTIVATION_REQUIRED_LABEL,
        body: "Your Bitcoin is confirmed - activate your BTC Vault to finish your deposit.",
      },
      activateAndRedeem: {
        title: WITHDRAW_REQUIRED_LABEL,
        body: "Your BTC Vault could not be activated - withdraw to recover your BTC.",
      },
      // In-flow prompt nudging the depositor to allow browser notifications so
      // we can ping them when a deposit needs a signature.
      prompt: {
        title: "Stay notified",
        message:
          "Turn on browser notifications and we'll let you know the moment your deposit needs you to sign.",
        enable: "Enable notifications",
        dismiss: "No thanks",
      },
    },
    groups: {
      registerDeposit: "Register deposit",
      signWots: "Set up claim",
      signPayout: "Sign payout",
      activateVault: "Activate BTC Vault",
      stepCounter: (completed: number, total: number) =>
        `${completed}/${total}`,
    },
    // Screen-reader-only labels: the step/section status is otherwise conveyed
    // purely visually (spinner, checkmark, hollow circle).
    a11y: {
      stepActive: (number: number) => `Step ${number} active`,
      stepPending: (number: number) => `Step ${number} not started`,
      stepFailed: (number: number) => `Step ${number} failed`,
      groupStatus: {
        completed: "Completed",
        active: "In progress",
        upcoming: "Not started",
      },
    },
    progress: {
      heading: "Deposit Progress",
      // Pre-sign summary card shown before the flow starts: an estimated total
      // duration suffixed to the heading (derived from the on-chain
      // confirmation depth) plus a short explanation of the grouped counts.
      summary: {
        estimate: (duration: string) => `~${duration}`,
        description:
          "Each step is divided into several wallet signature confirmations. The progress counter shows how many are completed. Your Bitcoin will only be locked once the BTC Vault is activated.",
      },
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
      buttons: {
        closeContinueLater: "Close & continue later",
        retry: "Retry",
        close: "Close",
        done: "Done",
        sign: "Sign",
        signTransaction: SIGN_TRANSACTION_LABEL,
      },
    },
    btcConfirmation: {
      estRemaining: "Est. remaining",
      estRemainingValue: (minutes: number, blocksLeft: number) =>
        `~${minutes} min (${blocksLeft} BTC ${
          blocksLeft === 1 ? "block" : "blocks"
        })`,
      finalizing: "Finalizing...",
      waitingForPayoutPrep:
        "Waiting for vault provider to prepare claim and payout transactions...",
      bitcoinTx: "Pre-Pegin Bitcoin transaction",
    },
    waitDetails: {
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
      heading: "Expired BTC Vault withdrawal broadcast",
      body: "Your expired BTC Vault withdrawal transaction has been broadcast successfully.",
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
      feeRateCapError: (maxRateSatsVb: number) =>
        `Network fee rate exceeds the safety cap of ${maxRateSatsVb} sat/vB. Lower the fee rate to continue.`,
      // The cap is a percentage of the vault deposit (the SDK's basis), not of
      // the larger refund amount shown above — so frame it as the safety cap
      // rather than "% of the refund amount", which would contradict the
      // displayed figure.
      feeFractionCapError: (percent: number) =>
        `Network fee exceeds the ${percent}% refund safety cap. Lower the fee rate to continue.`,
      retryButton: "Retry",
      confirmButton: "Confirm",
    },
    activateConfirmation: {
      title: "Activate your BTC Vault",
      // The download instruction is emphasized (primary text color) per the
      // design; the surrounding prose stays secondary.
      body: [
        { text: "Before activating, ", emphasis: false },
        { text: "download the recovery artifacts", emphasis: true },
        {
          text: " of your BTC Vault. These files will make sure your BTC Vault is fully functional even if your vault provider becomes unavailable.",
          emphasis: false,
        },
      ] satisfies EmphasisBodySegment[],
      // Shown once the artifacts are on disk (the download just finished, or
      // the modal opened for a vault whose artifacts were saved earlier);
      // pairs with the green-card layout.
      titleDownloaded: ARTIFACTS_DOWNLOADED_TITLE,
      bodyDownloaded: ARTIFACTS_DOWNLOADED_BODY,
      riskAcknowledgement:
        "I understand the risks of continuing without the artifacts.",
      activateButton: "Activate vault",
      cancelButton: "Cancel",
      cancelDownloadButton: CANCEL_DOWNLOAD_LABEL,
      // Advanced entry into the activate-and-redeem escape hatch, rendered as
      // a muted link under the activation confirmation so it is always
      // reachable on a Verified BTC Vault without competing with the primary
      // activation path.
      advancedWithdrawLink: "Unable to activate? Withdraw without activating",
    },
    // Activate-and-redeem escape hatch: reveals the HTLC secret and redeems
    // the BTC Vault in one transaction, skipping application activation. Two
    // body variants: `bodyStuck` when the stuck state was detected on-chain
    // (peg-in swept while the vault is still Verified), `bodyAdvanced` when
    // the user reached it via the advanced link and waiting for expiry +
    // refund is still the safe default.
    emergencyWithdraw: {
      title: "Withdraw without activating",
      // Reassurance first: the stuck state looks like lost funds but is
      // fully recoverable through this flow.
      // Both bodies state the wait before the acknowledgement, not only on the
      // success screen: the BTC comes back through the vault provider's normal
      // claim pipeline, so a depositor who expects funds within the hour would
      // be committing to the reveal on a false premise. Deliberately no figure
      // — the real wait is the vault's `timelockAssert`, a protocol parameter
      // this screen does not resolve, and a hardcoded one would be a guess.
      bodyStuck:
        "Your BTC is not lost. The peg-in was completed on Bitcoin, but the BTC Vault was never activated. Withdrawing redeems the BTC Vault — the vault provider will send your BTC to your payout address, which takes several days.",
      bodyAdvanced:
        "This reveals your HTLC secret and redeems the BTC Vault without activating it. The vault provider will send your BTC to your payout address, which takes several days. If you are unsure, cancel and wait — letting the BTC Vault expire and refunding is the safe default.",
      riskAcknowledgement:
        "I understand this permanently reveals my HTLC secret and cannot be undone.",
      // Shown when the vault's application is registered but not Active on
      // chain: the registry rejects the redeem in that state, so the action
      // is withheld rather than failing after the user commits to revealing
      // the secret.
      applicationInactive:
        "This BTC Vault's application is not currently active on the vault registry, so withdrawing would be rejected. Your secret has not been revealed. Please try again later or contact support.",
      confirmButton: "Withdraw without activating",
      retryButton: "Retry",
      cancelButton: "Cancel",
      // Pre-flight failures surfaced in the modal's error callout, so single
      // lines rather than the {title, body} shape the error modals use.
      errors: {
        btcWalletNotConnected: "BTC wallet is not connected",
        ethWalletNotConnected: "ETH wallet is not connected",
        withdrawFailed: "Failed to withdraw BTC Vault",
      },
      success: {
        heading: "Withdrawal submitted",
        body: "Your BTC Vault has been redeemed. The vault provider will send your BTC to your payout address. This typically takes up to 3 days.",
        doneButton: "Done",
      },
    },
    artifactDownload: {
      title: "Download BTC Vault artifacts",
      body: "Download your BTC Vault artifacts. These files are required to independently claim your funds if the vault provider is unavailable.",
      // Shown after the download completes (third copy bucket for the
      // same modal); the green-card layout pairs with this title.
      titleDownloaded: ARTIFACTS_DOWNLOADED_TITLE,
      bodyDownloaded: ARTIFACTS_DOWNLOADED_BODY,
      cancelButton: "Cancel",
      cancelDownloadButton: CANCEL_DOWNLOAD_LABEL,
      // Right footer button in the downloaded state. This dialog only
      // confirms the artifacts are on disk (collateral list); it doesn't
      // perform activation, so the label simply dismisses it.
      doneButton: "Done",
    },
    vaultActivatedSuccess: {
      heading: "Vault activated",
      body: "Your vault is now active and ready for borrowing.",
      goToDashboard: "Go to Dashboard",
    },
    recoveryArtifacts: {
      cardTitle: "Recovery artifacts",
      cardSubtitle: "Encrypted backup files",
      cardSize: "Up to ~1 GB",
      // Size variant rendered once the download has completed — the
      // "Up to" hedge no longer applies because the file is on disk.
      cardSizeDownloaded: "~1 GB",
      downloadButton: "Download Artifacts",
      downloadingButton: "Downloading...",
      retryButton: "Retry",
      walletSignatureHint:
        "You may be asked to approve a signature in your wallet to authenticate.",
      // Caption under the progress bar while bytes are streaming.
      doNotCloseHint: "Do not close this window while downloading.",
      cannotAuthenticate:
        "Cannot authenticate with the vault provider. Please refresh and try again.",
      // Progress/status lines surfaced in the card while the download hook
      // works through its fetch / re-auth / wait-for-signatures states.
      // The signature status shows while the cold-cache auth prime waits on
      // the BTC wallet's signature prompt.
      signTransaction: SIGN_TRANSACTION_LABEL,
      fetchingArtifacts: "Fetching artifacts from vault provider...",
      reauthenticating: "Re-authenticating with vault provider...",
      waitingForSignatures:
        "Waiting for vault provider to process signatures...",
      // Error fallbacks shown when a thrown error carries no usable message.
      authenticationFailed: "Authentication failed",
      reauthenticationFailed: "Re-authentication failed",
      downloadFailed: "Download failed",
      unknownRpcError: "Unknown RPC error",
      // Shown while the browser's save-location dialog is open. The picker is
      // opened before the wallet prompt, so this is the first status a user
      // sees after pressing Download.
      choosingSaveLocation: "Choose where to save your artifacts...",
      savePickerDescription: "BTC Vault recovery artifacts",
      // The browser refused the chosen location, or the write failed partway
      // through (permission revoked, disk full).
      fileAccessDenied:
        "Could not write to the selected location. Choose a different folder and try again.",
      // Browsers without the File System Access API must hold the whole file
      // in memory, which a full-size bundle does not survive.
      tooLargeForBrowser:
        "This browser cannot save a file this large. Please use a Chromium-based browser, such as Chrome or Brave, to download your artifacts.",
      // Rendered on those same browsers before the download starts, so the
      // limits are not a surprise partway through a long transfer. This path
      // must hold the whole ~1 GB file in memory, and the browser reports
      // nothing back about whether it was saved.
      fallbackSaveHint:
        "This browser must hold the entire file in memory and may run out on a smaller device. It also cannot confirm the file was saved, so your BTC Vault will keep showing the artifact warning. For a reliable download, use a Chromium-based browser such as Chrome or Brave.",
      // Shown after that same fallback path finishes. The transfer is done and
      // the file was handed to the browser, but a blocked or dismissed save
      // looks identical to a successful one from here, so this state stops
      // short of claiming the download succeeded — the risk acknowledgement
      // stays required and the vault keeps warning.
      unverifiedSaveTitle: "Download finished, but we cannot confirm it saved",
      unverifiedSaveNotice:
        "Check your downloads folder for the file. Because this browser does not report whether the save completed, your BTC Vault will keep showing the artifact warning. To clear it, download again using a Chromium-based browser such as Chrome or Brave.",
      // The fallback path may well have worked; this offers a retry without
      // implying the first attempt failed.
      downloadAgainButton: "Download Again",
    },
    form: {
      computingAllocation: "Computing allocation...",
      transactionReserveLabel: "Transaction Reserve",
      transactionReserveTooltip:
        "A small portion of your deposit is reserved in a dedicated output to fund a future protocol claim transaction. It remains locked until claim conditions are met and is returned to you if unused.",
      // The depositable maximum is labelled as the balance, with `maxTooltip`
      // explaining the fee buffer / cap adjustments.
      balanceLabel: "Balance",
      maxTooltip: (opts: { hasSupplyCap: boolean }) =>
        opts.hasSupplyCap
          ? "Reserves a fee buffer, excludes inscription UTXOs, and stays within the supply cap."
          : "Reserves a fee buffer and excludes inscription UTXOs.",
      pendingConfirmationNotice: (amount: string) =>
        `${amount} pending confirmation`,
      pendingConfirmationTooltip:
        "Only balances confirmed in a Bitcoin block are shown here. This amount is still waiting to confirm.",
      doNotSplit: "Do not split",
      selectVaultProvider: "Select vault provider",
      providerSelectDescription: "Choose a vault provider to secure your BTC",
      // v3 picker intro. The docs clause + link is appended only when a vault
      // provider docs URL is configured (see VAULT_PROVIDER_DOCS_URL); the
      // lead-in sentence stands alone otherwise.
      providerSelectDescriptionV3:
        "Choose a vault provider to assist with your vault maintenance.",
      providerSelectDescriptionDocs:
        " For more information about vault provider or to create your own, ",
      providerSelectDescriptionLink: "please go here.",
      // Sub-line under the v3 intro, describing the picker's ordering.
      providerSortNote: "Sorted by most recent deposit",
      providerSelectEmpty: "No vault providers available at this time.",
      providerStatusUnavailable: "Unavailable",
      // Status label for a vault provider that has recently been unreachable
      // per the health proxy. It stays selectable (health can recover).
      providerStatusUnhealthy: "Recently unreachable",
      // Per-provider metric labels shown in the picker.
      providerCommissionLabel: "Commission",
      // v3 picker column labels + healthy-provider status line. The v3 rows
      // are a metric table, so the labels sit under their values instead of
      // reading as a sentence.
      providerActiveBtcLabel: "Active BTC",
      providerLastDepositLabel: "Last deposit",
      providerStatusActive: "Active",
      // Fee-breakdown lines (DepositFeesBreakdown) shown before the user
      // submits. The commission label appends the percent, e.g. "VP commission
      // (2.50%)"; net payout is the deposit minus that commission.
      vpCommissionLabel: "VP commission",
      vpCommissionTooltip:
        "The vault provider's fee, deducted from your payout when you redeem. Set by the vault provider and shown here before you deposit.",
      netPayoutLabel: "Net payout",
      netPayoutTooltip:
        "What you receive at payout: your deposit minus the vault provider's commission.",
      // Placeholder while a metric (commission, active BTC) is loading or
      // could not be fetched.
      providerMetricPlaceholder: "—",
      // Accessible label / tooltip for the per-provider explorer link.
      providerExplorerLinkLabel: "View vault provider on explorer",
      // Split-option title. "Two-vault split" (not "UTXO split") because the
      // UTXO concept is never introduced to the depositor; the ratio (e.g.
      // "26/74") shows how the deposit is divided across the two BTC Vaults.
      splitOptionLabel: (splitRatioLabel: string | null) =>
        splitRatioLabel
          ? `${TWO_VAULT_SPLIT_NAME} - ${splitRatioLabel}`
          : TWO_VAULT_SPLIT_NAME,
      splitOptionRecommended: "(Recommended)",
      // Shown inside the amount card (below "Max to Borrow") when the deposit is
      // below the minimum needed to split across two vaults; the split selector
      // below stays visible with its two-vault option disabled. `minBtc` already
      // carries the network coin symbol (e.g. "0.4 BTC"). The split name and
      // minimum are
      // emphasized (primary text) by the component; the rest stays secondary.
      // The component joins these fragments with explicit `{" "}` separators.
      splitTooLowHint: (minBtc: string) => ({
        prefix: "To use",
        splitName: TWO_VAULT_SPLIT_NAME,
        middle: ", increase your deposit to",
        minimum: `at least ${minBtc}`,
      }),
      splitOptionDescription:
        "Split your BTC into two BTC Vaults to enable partial liquidation.",
      noSplitOptionDescription:
        "Your BTC will be deposited into a single BTC Vault.",
      // "Learn more here." link appended to the split-option description in
      // UtxoSplitSelector, pointing at the partial-liquidation docs.
      learnMore: "Learn more here.",
      // CollateralFactorRow: leads with the max-borrowable USD, CF in parens.
      maxToBorrowLabel: "Max to Borrow:",
      cfParenthetical: (percent: string) => `(CF=${percent})`,
      // DepositFeesBreakdown: "Protocol Fee" line renamed to "Deposit Fee".
      depositFeeLabel: "Deposit Fee",
      depositFeeTooltip:
        "A one-time fee charged by the protocol to process your deposit.",
      suggestedDepositLabel: "Suggested deposit",
    },
    resume: {
      broadcastSuccessMessage: PRE_PEGIN_BROADCAST_CONFIRMATION_MESSAGE,
      readyToActivateMessage:
        "Your payout transactions are signed and verified. Your BTC Vault is ready to activate.",
      wotsMismatchError: WRONG_WALLET_BODY,
      // Resume's cold path fires a wallet approval the WOTS step copy doesn't
      // mention, and some extensions queue it without surfacing a popup.
      wotsWalletApprovalHint:
        "You may be asked to approve a request in your BTC wallet. If no approval window appears, open your wallet extension.",
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
      // Surfaced if deposit execution is reached while the protocol is frozen or
      // paused — aborted up front, before the on-chain registration and the BTC
      // broadcast, so no funds are locked and the user can retry once it resumes.
      protocolPaused:
        "New deposits are temporarily disabled while the protocol is frozen or paused. No Bitcoin was sent — please try again once it resumes.",
      cannotActivateInState: (state: string) =>
        `Cannot activate: BTC Vault is in ${state} state. Activation is only valid when VERIFIED.`,
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
      // Action on the error callout: puts the full raw error on the clipboard
      // so a report carries the whole thing, not a screenshot of part of it.
      copyDiagnostics: "Copy error details",
      diagnosticsCopied: "Copied",
      diagnosticsCopyFailed: "Couldn't copy — select and copy manually",
      insufficientEthForGas: {
        title: TRANSACTION_FAILED_TITLE,
        body: "Your wallet doesn't have enough ETH to cover the network fee. Add more ETH and retry the transaction.",
      },
      // Fail-closed preflight: the protocol (or a resumed deposit's stamped
      // version) requires a transaction format this app build cannot
      // construct. Shown as the disabled deposit CTA label (title) and as
      // the error body on resume actions (broadcast / sign / refund) and in
      // the defense-in-depth error mapping. No funds move.
      appVersionUnsupported: {
        title: "App update required",
        body: "This deposit requires a newer version of the app. Please refresh the page and try again — if the issue persists, an updated release is on its way.",
      },
      activationDeadlinePassed: {
        title: "Activation deadline passed",
        // Reuse the canonical ABI-keyed message so this terminal callout can't
        // drift from the ActivationDeadlineExpired contract-error string.
        body: `${CONTRACT_ERROR_MESSAGES.ActivationDeadlineExpired} You can reclaim your BTC through the refund flow once it becomes available.`,
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
      participantKeyDrift: {
        title: "Vault operator keys changed",
        body: "A vault operator rotated its Bitcoin key while your deposit was being registered, so the registered vault no longer matches the transaction we prepared. Your Pre-PegIn was not broadcast and no Bitcoin was spent. The registered vault will time out on its own — please start a new deposit.",
      },
      wrongWalletAccount: {
        title: "Wrong wallet account",
        body: WRONG_WALLET_BODY,
      },
      commissionChanged: {
        title: "Commission changed",
        body: "The vault provider raised its commission since you selected it. Please refresh to see the new commission and start the deposit again.",
      },
      commissionUnavailable: {
        title: "Commission unavailable",
        body: "We couldn't confirm the vault provider's commission. Please refresh and try again before depositing.",
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
          title: "Vault provider not found",
          message:
            "The vault provider could not be found in the on-chain registry. It may have been deregistered.",
        },
        connectionFailed: {
          title: "Connection failed",
          message:
            "Unable to connect to the vault provider. Please check your connection and try again.",
        },
        sessionExpired: {
          title: "Session expired",
          message:
            "Your session with the vault provider is no longer valid and could not be renewed automatically. Please reload the page and try again.",
        },
        providerTimeout: {
          title: "Vault provider timeout",
          message:
            "The vault provider took too long to respond. Please try again later.",
        },
        providerUnavailable: {
          title: "Vault provider unavailable",
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
        title: "Vault provider not assigned",
        message:
          "No vault provider is associated with this deposit. Please wait for indexer sync and try again.",
      },
      providerNotFound: {
        title: "Vault provider not found",
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
    zeroUsdValue: "$0.00 USD",
    // Placeholder shown where a value is not yet available (e.g. an
    // oracle-priced figure still loading after an asset switch).
    emptyValue: "–",
    // Separator between a metric's current and projected value (before → after).
    valueTransitionArrow: "→",
    loading: "Loading...",
    // Accessible label for the shared v3 modal header close control.
    close: "Close",
    confirming: "Confirming...",
    applying: "Applying...",
    checking: "Checking...",
    transactionFailedTitle: "Transaction failed",
    dismissNotification: "Dismiss notification",
    somethingWentWrong: {
      heading: SOMETHING_WENT_WRONG_HEADING,
      body: "Please close this and try again in a moment.",
    },
    globalError: {
      heading: SOMETHING_WENT_WRONG_HEADING,
      body: "An unexpected error occurred. Please try again later.",
      retryButton: "Try again",
      // Shown instead of the generic crash when the failure is a stale-deploy
      // chunk 404 (a newer app version was deployed); body reuses
      // `classifiedErrors.staleDeploy`.
      staleDeployHeading: "A new version is available",
      reloadButton: "Reload",
    },
    // Friendly copy for known viem / EIP-1193 / wallet-connector failure
    // categories. Consumed by `sanitizeErrorMessage` in
    // `src/utils/errors/formatting.ts` and by `mapViemErrorToContractError`
    // in `src/utils/errors/contract.ts`. Cross-feature surface (deposit,
    // refund, activation, Aave borrow/repay/withdraw) so lives under
    // `common` rather than `deposit`.
    classifiedErrors: {
      userRejection:
        "Transaction rejected in your wallet. No changes were made — try again when you're ready.",
      insufficientFunds:
        "Not enough ETH to cover the network gas fee. Add ETH to your wallet and try again.",
      walletDisconnected:
        "Your wallet was disconnected. Reconnect it and try again.",
      unauthorized:
        "This site isn't authorized in your wallet. Approve the connection and try again.",
      chainSwitchFailed:
        "Couldn't switch your wallet to the required network. Switch chains manually and try again.",
      receiptTimeout:
        "We couldn't confirm your transaction. Check your wallet or a block explorer for the latest status.",
      network: "Network error. Check your connection and try again.",
      rpcError:
        "We couldn't complete your request right now. Please wait a moment and try again.",
      alreadySubmitted:
        "This transaction was already submitted. Check your wallet or a block explorer for its status.",
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
    locked: {
      title: "Bitcoin wallet locked",
      description: "Unlock your Bitcoin wallet in your extension to continue.",
      unlockButton: "Unlock wallet",
      // Deposit-form CTA: names the action the unlock unblocks, unlike the
      // navbar / progress-modal button which is just "Unlock wallet".
      unlockToDepositButton: "Unlock Wallet to Deposit",
      unlocking: "Unlocking wallet...",
    },
    publicKeyUnavailable:
      "Your BTC wallet did not return a public key. Please reconnect your wallet and try again.",
  },
  collateral: {
    uncapped: "Uncapped",
    // Shown on an optimistic collateral row right after the activation ETH tx,
    // while the indexer catches up and the vault becomes "In use".
    activating: "Activating collateral...",
    empty: {
      title: "Deposit Bitcoin to get started",
      body: (symbol: string) =>
        `Add ${symbol} as collateral so you can begin borrowing assets.`,
    },
  },
  // Links to the Babylon BTC Vault explorer (Xangle). Only rendered when
  // NEXT_PUBLIC_TBV_VP_EXPLORER_URL is set; icon links use these as the
  // accessible name + tooltip.
  explorer: {
    // Callout under the Protocol Cap section. `calloutLinkText` renders as the
    // anchor to the explorer home; `callout` is the plain lead-in.
    callout:
      "Explore BTC Vault activity, liquidity metrics, and protocol statistics in the",
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
        label: "Submitted",
        message:
          "Your withdrawal request has been received and is being processed.",
      },
      claimBroadcast: {
        label: "In progress",
        message:
          "Your withdrawal is in progress. A claim transaction has been broadcast to Bitcoin.",
      },
      assertBroadcast: {
        label: "Challenge period",
        message:
          "Your withdrawal is going through its on-chain challenge period before the BTC payout can be broadcast.",
      },
      payoutBroadcast: {
        label: "Payout sent",
        message:
          "The Bitcoin payout transaction has been broadcast to your nominated address.",
      },
      payoutBlocked: {
        label: "Blocked",
        message:
          "Withdrawal was blocked on-chain (challenger or council override). Please contact support.",
      },
      initiating: {
        // Pre-claim state folds into the "Submitted" stage on the card.
        label: "Submitted",
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
  },
  loans: {
    heading: "Loans",
    // Per-row action on an already-borrowed asset (Active Loans list) — the
    // user has a position here, so it borrows *more* of this asset.
    borrowMoreButton: "Borrow more",
    repayButton: "Repay",
    // v3 Loans page: "Active Loans (N)" section heading.
    activeLoansHeading: (count: number) => `Active Loans (${count})`,
    // v3 Loans page empty state (connected, no debt).
    noActiveLoans: {
      title: "No active loans",
      body: "You haven't borrowed any assets yet",
    },
    // v3 Loans page empty state, disconnected — no position to describe yet,
    // so it's a title-only prompt like the Activity tab's.
    emptyDisconnected: connectToView("loans"),
    // v3 Loans summary — caption under the health-factor value.
    healthFactorCaption:
      "When the ratio falls below 1.0, liquidation may occur.",
    // Live drawn borrow rate for the asset (Aave Hub), no compounding applied —
    // an APR, the same figure the asset picker labels "Borrow APR". One number,
    // one label.
    borrowRateLabel: "Borrow APR",
    // Repay detail-card metric: outstanding debt for the selected reserve, in
    // token units (before → after the repayment).
    debtLabel: "Debt",
    healthFactorLabel: "Health factor",
    availableLiquidityLabel: "Available liquidity",
    utilizationLabel: "Utilization",
    availableLabel: "Available",
    // Repay amount slider: prefixes the user's wallet balance shown beside Max.
    balanceLabel: "Balance",
    atRiskOfLiquidation: "At risk of liquidation",
    borrowAprTooltip:
      "The annual interest rate charged on your borrowed amount.",
    utilizationTooltip:
      "The share of this market's supplied liquidity currently borrowed.",
    debtTooltip:
      "The total amount you currently owe for this asset, including accrued interest.",
    healthFactorTooltip:
      "Your position's safety margin. If it falls below 1.0, your collateral can be liquidated.",
    borrowingUnavailable:
      "Borrowing is temporarily unavailable. Please check back later.",
    priceUnavailable:
      "Price data unavailable. Borrowing is temporarily disabled.",
    // Shown on the Repay tab when repay is blocked by a protocol pause (not a
    // technical/user error), so a user near liquidation knows it's governance,
    // not a bug. Repay is gated by a pause on either scope.
    repayingUnavailable:
      "Repaying is temporarily unavailable while the protocol is paused. It will resume once the pause is lifted.",
    // Borrow tab — action-button labels (also used as the status-callout title).
    borrow: {
      action: "Borrow",
      processing: "Processing...",
      unavailable: "Borrowing Unavailable",
      enterAmount: "Enter an amount",
      refreshingPosition: "Refreshing position...",
      amountTooSmall: "Amount too small",
      amountExceedsMax: "Amount exceeds maximum",
      amountExceedsLiquidity: "Amount exceeds available liquidity",
      healthFactorTooLow: "Health factor too low",
    },
    // Borrow validation-error descriptions (the Callout title comes from the
    // action button label above, e.g. "Amount exceeds maximum").
    validation: {
      minBorrow: (min: string) =>
        `The minimum borrowable amount is ${min}. Enter a higher amount and try again.`,
      maxBorrow: (max: string, symbol: string) =>
        `The maximum borrowable amount is ${max} ${symbol}. Enter a lower amount and try again.`,
      exceedsLiquidity: (available: string, symbol: string) =>
        `Only ${available} ${symbol} is available to borrow from this market right now. Enter a lower amount and try again.`,
      healthFactorTooLow: (min: number) =>
        `Borrowing this amount would drop your health factor below ${min}, risking liquidation. Reduce the amount and try again.`,
    },
    connectToManage: {
      title: "Connect to manage position",
      body: "Please connect your wallet to manage your position.",
    },
    reserveNotFound: "Reserve not found",
    assetSelection: {
      title: "Select asset",
      columnAsset: "Asset",
      columnPrice: "Price",
      columnAvailable: "Available",
      columnBorrowApr: "Borrow APR",
      loading: "Loading assets...",
      emptyBorrow: "No borrowable assets available",
      emptyRepay: "No assets available",
      marketInfo: "Market Info",
      marketInfoAriaLabel: (symbol: string) => `${symbol} market info`,
    },
    borrowSuccess: {
      title: "Borrow successful",
      body: (amount: string, symbol: string): EmphasisBodySegment[] => [
        {
          text: `${amount} ${symbol} has been credited to your wallet.`,
          emphasis: false,
        },
      ],
      doneButton: "Done",
    },
    repaySuccess: {
      title: "Repay successful",
      body: (amount: string, symbol: string): EmphasisBodySegment[] => [
        { text: "You have repaid ", emphasis: false },
        { text: `${amount} ${symbol}`, emphasis: true },
      ],
      doneButton: "Done",
    },
    empty: {
      title: (symbol: string) => `Borrow assets using your ${symbol}`,
      body: (symbol: string) =>
        `Deposit ${symbol} as collateral to start borrowing.`,
    },
    // Repay tab — validation button labels and depositor-facing messages.
    repay: {
      action: "Repay",
      processing: "Processing...",
      // Action-button label when repay is blocked by a protocol pause.
      unavailable: "Repaying Unavailable",
      enterAmount: "Enter an amount",
      amountTooSmall: "Amount too small",
      amountExceedsDebt: "Amount exceeds debt",
      insufficientBalance: "Insufficient balance",
      cannotExceedDebt: "You cannot repay more than your current debt.",
      minRepayable: (amount: string) => `Minimum repayable amount is ${amount}`,
      // `symbol` undefined → generic "tokens"; otherwise names the token.
      zeroBalance: (symbol: string | undefined, minAmount: string) =>
        `Your ${symbol ? `${symbol} ` : ""}balance is 0. Acquire at least ${minAmount} ${symbol ?? "tokens"} to repay your debt.`,
      shortfall: (
        balance: string,
        debt: string,
        residual: string,
        unit: string,
      ) =>
        `Your balance (${balance}) is less than your debt (${debt}). Repaying now will leave ${residual} in debt; acquire more ${unit} to fully clear it.`,
      insufficientForFull: (balance: string, unit: string) =>
        `You only have ${balance} ${unit} available. You need more ${unit} to fully repay your debt.`,
      // Shown when the wallet balance query fails so the user isn't left with a
      // disabled repay button and no explanation.
      balanceLoadError: "Couldn't load your balance. Please try again.",
      // Post-approve verification failures. Wording must avoid the substrings
      // getEnhancedErrorMessage rewrites (see utils/errors/contract.ts).
      approvalNotConfirmed: (required: string, observed: string) =>
        `Token approval could not be confirmed on-chain (required ${required}, last read ${observed}). The network may be briefly out of sync — please try again.`,
      approvalBelowRequired: (required: string, approved: string) =>
        `The wallet approved a lower amount than required (required ${required}, approved ${approved}). Please retry and approve the full amount.`,
      // The full-repay quote includes accrued interest + the adapter fee, so
      // it can exceed the displayed debt. Wording avoids the rewrite substrings.
      balanceBelowFullRepay: (required: string, balance: string) =>
        `Repaying in full needs ${required} (including accrued interest and fees), but your balance is ${balance}. Acquire a little more and try again.`,
      // Submit-time backstop for a partial repay: the form blocks this, so it
      // only fires when the balance drops between render and submit.
      balanceBelowRepayAmount: (required: string, balance: string) =>
        `Repaying ${required} needs more than your balance of ${balance}. Lower the amount or acquire more and try again.`,
      // Submit-time (Max intent) balance/debt refetch failure.
      refetchError: "Couldn't refresh balance/debt — please try again.",
      // Shown when the indexer-supplied proxy contract disagrees with the
      // on-chain proxy resolved from the env-pinned adapter (fail closed).
      integrityError:
        "Position integrity check failed: your position details returned by the indexer don't match what's registered on-chain. Refresh and try again. If this persists, do not proceed.",
    },
    // Reserve detail overlay (applications/aave/components/Detail).
    // Reserve-identity states shared by the loan overlay's form step and the
    // borrowing markets data page. Loading / connect / not-found copy is the
    // flat `loans.*` set above; these are the audit-F7 additions.
    detail: {
      // Older links carried the token symbol (`?reserve=usdc`, `/markets/usdc`)
      // rather than the reserve's on-chain id. Those are blocked, never
      // resolved by symbol.
      reserveLinkOutdated:
        "This link uses an outdated format. Please select the asset again from Loans.",
      // The reserve's asset could not be confirmed on-chain. Deliberately
      // alarming, and offered without a retry: the result is deterministic, so
      // a retry button would only invite the user to click past the warning.
      identityBlockedTitle: "Asset could not be verified",
      identityBlockedDescription:
        "The asset shown for this market doesn't match what's registered on-chain. For your safety, this market can't be used here. Do not proceed — return to Loans and select the asset again.",
      // Verification couldn't complete (network or RPC failure), as opposed to
      // completing and failing. Neutral, and retryable.
      identityUnavailableTitle: "Couldn't verify this asset",
      identityUnavailableDescription:
        "We couldn't confirm this market's asset on-chain. Check your connection and try again.",
      retry: "Retry",
      // Position load failure (hard-block) and the ancillary soft-warn, both in
      // Detail/PositionGate.tsx.
      positionLoadError: "Couldn't load your position. Please try again.",
      ancillaryLoadWarning:
        "Some data couldn't be loaded. Borrow may be unavailable; repay still works from your loaded debt.",
    },
  },
  // Borrowing markets data page (Figma node 10088-60956).
  marketData: {
    pageTitle: "Borrowing markets data",
    backToAssets: "Back to assets",
    subtitle: (symbol: string) =>
      `Learn more about the ${symbol} borrow market`,
    borrowAction: "Borrow",
    // Shown instead of the metrics when a Hub or oracle read failed, so a
    // failed read is never mistaken for a metric that has no value.
    dataUnavailable:
      "Market data is unavailable right now. Please try again shortly.",
    // Stats bar above the fold. Title Case per the Figma; the design's
    // "Utilisation" is respelled to the American form this file mandates.
    stats: {
      availableLiquidity: "Available Liquidity",
      borrowApr: "Borrow APR",
      supplied: "Supplied",
      suppliedTooltip:
        "Total liquidity supplied to this market — the borrowed amount plus what is still available.",
      totalBorrowed: "Total Borrowed",
      marketUtilization: "Market Utilization",
    },
    collateral: {
      assetLabel: "Collateral Asset",
      // The protocol takes one collateral: BTC locked in a vault. Named for
      // what the depositor supplied, not for the vaultBTC reserve token.
      assetName: "Native BTC",
      factorLabel: "Collateral Factor",
      factorTooltip:
        "The share of your collateral's value you can borrow against before liquidation applies.",
    },
    interestRateModel: {
      title: "Interest rate model",
      description:
        "The more liquidity is borrowed, the higher the rate — this keeps the market balanced.",
    },
    borrowMarkets: {
      title: "Borrow markets",
      description: (symbol: string) =>
        `Understand market conditions, rates, and risk before borrowing ${symbol}`,
      columns: {
        market: "Market",
        borrowApr: "Borrow APR",
        available: "Available",
        availableTooltip:
          "Liquidity still borrowable from this market right now.",
        utilization: "Utilization",
        borrowed: "Borrowed",
        supplied: "Supplied",
      },
      empty: "No borrow markets available.",
    },
    // Borrow APR history + interest rate model charts (Figma node
    // 10088-61056). Labels follow this file's sentence-case rule;
    // "Utilisation" is respelled to the American form this file mandates.
    charts: {
      borrowAprLabel: "Borrow APR",
      // Header caption and the IRM card's legend entry — one string so the
      // two can't drift apart in case.
      utilizationRateLabel: "Utilization rate",
      utilizationRateTooltip:
        "The share of supplied liquidity currently borrowed. Higher utilization moves the market up this curve, raising the borrow rate.",
      ranges: { d1: "1D", w1: "1W", m1: "1M", m6: "6M", y1: "1Y", all: "All" },
      rateRange: (min: string, max: string) => `${min} – ${max}`,
      currentCallout: (pct: string) => `Current ${pct}`,
      optimalCallout: (pct: string) => `Optimal (Kink) ${pct}`,
      calloutApr: (pct: string) => `APR ~ ${pct}`,
      historyAriaLabel: (symbol: string) => `${symbol} borrow APR history`,
      irmAriaLabel: (symbol: string) =>
        `${symbol} borrow rate against utilization`,
      chartUnavailable:
        "Chart data is unavailable right now. Please try again shortly.",
      historyEmpty: "No rate history yet for this market.",
    },
  },
  nav: {
    overview: "Overview",
    vaults: "Vaults",
    loans: "Loans",
    activity: "Activity",
    liquidations: "Liquidations",
    explore: "Explore",
    termsOfUse: "Terms of Use",
    privacyPolicy: "Privacy Policy",
  },
  // v3 page-title header (services/vault/src/components/pages/RootLayout.tsx).
  header: {
    // Network indicator chip, shown only on non-production networks (see
    // components/shared/NetworkBadge.tsx).
    networkBadge: "Testnet",
  },
  // Entry-screen footer (components/shared/EntryFooter.tsx). The legal link
  // labels it renders are the shared `nav` ones.
  footer: {
    copyright: (year: number) =>
      `© ${year} Babylon Labs. All rights reserved.`,
    legalSeparator: " - ",
  },
  // v3 Explore page (components/pages/Explore.tsx). Per-app names/descriptions
  // are dataset content and live in config/exploreApps.ts, not here.
  explore: {
    subtitle:
      "Explore apps and integrations built around Bitcoin-backed liquidity.",
    goToApp: "Go to App",
    empty: {
      title: "No apps to explore yet",
      description:
        "Check back soon for apps and integrations built around Bitcoin-backed liquidity.",
    },
  },
  // v3 Liquidation Dashboard (components/pages/Liquidations).
  liquidations: {
    heading: "Liquidation Analysis",
    vaultsLiquidated: (liquidated: number, total: number) =>
      `${liquidated}/${total} vaults liquidated`,
    simulationChip: "Simulation",
    seizedSummaryLabel: "Seized",
    collateralSummaryLabel: "Collateral",
    simulateLabel: "Simulate BTC price",
    simulatePriceEntryLabel: "Enter BTC price",
    simulateDescription:
      "Simulate BTC price movements and see how your vault responds to liquidation risk.",
    exploreAction: "Explore",
    bitcoinPriceCaption: "Bitcoin Price",
    empty: {
      noDepositTitle: "No deposit yet",
      noDepositDescription:
        "Add collateral to unlock borrowing and see how your position responds to liquidation risk.",
      noLoanTitle: "Deposit added, no loan yet",
      noLoanDescription:
        "Borrow against your BTC to see your liquidation levels and simulate how price changes affect your position.",
      borrow: "Borrow",
      unavailableTitle: "Liquidation analysis unavailable",
      unavailableDescription:
        "The BTC price feed is unavailable or out of date, so we can't project your liquidation events right now. Your position details above are unaffected.",
    },
    reset: "Reset",
    eventTitle: (eventNumber: number) => `Liq Event ${eventNumber}`,
    containVaults: (names: string) => `(contain ${names})`,
    cumulativeSeized: (percent: number) => `${percent}% seized`,
    popover: {
      atPrice: "At price",
      distance: "Distance",
      vaults: "Vaults",
      seizes: "Seizes",
    },
    // Replaces a liquidated band's vault list + BTC amount on the chart.
    liquidatedBandLabel: "Liquidated",
    events: {
      heading: "Liquidation Events",
      subheading:
        "Vaults are seized in order — each vault group is one liquidation event.",
      badgeSacrificial: "Sacrificial",
      badgeProtected: "Protected",
      liquidatedInSimulation: "Liquidated in Simulation",
      collateral: "Collateral",
      liqPrice: "Liq Price",
      distance: "Distance",
      seizedVaultsSection: "Seized Vaults",
      targetSeizure: "Target seizure",
      overSeizure: "Over seizure",
      estimatedLiquidationSection: "Estimated Liquidation",
      collateralLiquidated: "Collateral liquidated",
      debtRepaid: "Debt Repaid",
      liquidatorProfit: "Liquidator profit",
      fairnessDebtRepaid: "Fairness Debt Repaid",
      fairnessPaymentWbtc: "Fairness Payment (wBTC)",
      positionAfterSection: "Position After Liquidation",
      btcRemaining: "BTC remaining",
      debtRemaining: "Debt remaining",
      hfAfterLiquidation: "HF after Liquidation",
    },
    position: {
      heading: "Position Overview",
      totalCollateralValue: "Total Collateral Value",
      totalBorrowed: "Total Borrowed",
      healthFactor: "Health Factor",
      deposit: "Deposit",
      repay: "Repay",
    },
    // v3 Liquidation Dashboard, disconnected — title-only prompt, matching
    // the other v3 tabs' disconnected empty state.
    emptyDisconnected: connectToView("liquidation analysis"),
  },
  overview: {
    heading: "Overview",
    positionTitle: "Position",
    healthFactorLabel: "Health factor",
    healthFactorTooltip:
      "Your position's safety margin. If it falls below 1.0, your collateral can be liquidated.",
    totalCollateralValueLabel: "Total collateral value",
    totalCollateralValueTooltip:
      "The total value of assets used as collateral.",
    totalBorrowedLabel: "Total borrowed",
    availableToBorrowLabel: "Available to borrow",
    depositAction: "Deposit",
    borrowAction: "Borrow",
    repayAction: "Repay",
    availableMeterLabel: (percent: number) => `${percent}% remaining`,
    borrowedMeterLabel: (percent: number) => `${percent}% borrowed`,
    availableMeterNearFullLabel: ">99% remaining",
    borrowedMeterBelowOneLabel: "<1% borrowed",
    availableMeterBelowOneLabel: "<1% remaining",
    borrowedMeterNearFullLabel: ">99% borrowed",
    liquidationPriceLabel: "Liquidation price",
    pctToLiquidationLabel: "% to liquidation",
    disconnected: {
      // Only the dot of the first "i" in Bitcoin is orange. `dotless` (U+0131)
      // is the same glyph minus its tittle — the app paints it over `dotted` in
      // the heading color, leaving just the dot orange, which is how the Figma
      // headline was drawn. Both share one advance width, so nothing shifts.
      heroTitle: {
        lead: "Borrow against native ",
        accentWord: {
          before: "B",
          dotted: "i",
          dotless: "ı",
          after: "tcoin,",
        },
        rest: " trustlessly.",
      },
      heroBody:
        "Powered by Babylon Trustless Bitcoin Vaults protocol, collateralize native Bitcoin and borrow stablecoins or WBTC directly from Aave V4.",
      connectButton: "Connect Wallet",
      aprHeading: "Current Borrowing Rates",
      aprSuffix: "p.a.",
      aprLabels: {
        usdt: "USDT",
        usdc: "USDC",
        wbtc: "WBTC",
      },
      stats: {
        tvlLabel: "TVL:",
        capLabel: "Deposit Cap:",
        capValue: (deposited: string, total: string) =>
          `${deposited}/${total} BTC`,
        capUncapped: "Uncapped",
        maxCfLabel: "Borrow up to:",
      },
      features: {
        competitiveRates: {
          title: "Competitive borrowing rates",
          body: "Access to Aave V4 liquidity & its transparent, market-based variable rates.",
        },
        fastAccess: {
          title: "Fast access to liquidity",
          body: "Vault setup and borrowing complete in about 3 hours.",
        },
        partialLiquidation: {
          title: "Partial liquidation supported",
          body: "for any loan position backed by multiple trustless Bitcoin vaults.",
        },
        selfCustodial: {
          title: "Native, trustless, and self-custodial",
          body: "No bridging. No wrapping. No pooled custody. Your native Bitcoin stays in a self-custodial vault — with no third party or signing quorum able to move or rehypothecate it.",
        },
        trustless: {
          title: "Verifiable, permissionless execution",
          body: "Collateral rules are enforced by code and cryptographic proofs — not by discretionary gatekeepers, committees, or off-chain liquidation decisions.",
        },
      },
    },
  },
  vaults: {
    empty: {
      title: "Your BTC Vaults will appear here",
      description:
        "Deposit BTC to create your first BTC Vault and unlock borrowing power without selling your Bitcoin.",
      // Disconnected: title-only prompt, matching the Loans and Activity tabs.
      disconnected: connectToView("BTC Vaults"),
      depositAction: "Deposit",
    },
    loadError:
      "We couldn't load your BTC Vaults. Check your connection and try again.",
    partialLoadError: {
      title: "Some of your BTC Vault data couldn't be loaded",
      body: "Totals or deposits shown may be incomplete. Refresh the page to try again.",
    },
    summary: {
      totalCollateralLabel: "Total Collateral Value",
      activeVaultsLabel: "Active Vaults",
      healthFactorLabel: "Health Factor",
      healthFactorCaption:
        "When the ratio falls below 1.0, liquidation may occur.",
      vaultCount: (count: number) =>
        count === 1 ? "1 Vault" : `${count} Vaults`,
      // e.g. "Order: 0.6 → 0.2 → 0.4 sBTC" — liquidation order, seized-first
      // vault leading.
      liquidationOrder: (amounts: string[], coinSymbol: string) =>
        `Order: ${amounts.join(" → ")} ${coinSymbol}`,
      // Liquidation ordinal shown beside a vault amount, e.g. "(1st)".
      liquidationOrdinal: (ordinal: string) => `(${ordinal})`,
    },
    sections: {
      pendingDepositsTitle: "Pending Deposit",
      // Heading over the vaults list before any vault is active — the count
      // is dropped while the section only holds the empty state.
      vaultsTitle: "Vaults",
      activeVaultsTitle: "Active Vaults",
      inactiveVaultsTitle: "Inactive Vaults",
      count: (count: number) => `(${count})`,
    },
    progressPercent: (percent: number) => `${percent}%`,
    actions: {
      reorder: "Reorder",
      withdraw: "Withdraw",
      viewDetails: "View Details",
    },
  },
  risk: {
    title: "Risk",
    healthFactorTitle: "Health Factor",
    healthFactorDescription:
      "Indicates the health of your position. When the ratio falls below 1.0, liquidation may occur.",
    healthFactorInfinity: "∞",
    status: {
      noPosition: "No Position",
      verySafe: "Very Safe",
      safe: "Safe",
      moderate: "Moderate",
      liquidatable: "Liquidatable",
    },
    liquidationBtcPriceLabel: "Liquidation BTC Price",
    currentBtcPriceLabel: "Current BTC Price",
    collateralFactorLabel: "Collateral Factor",
    collateralFactorTooltip:
      "The maximum share of your collateral's value that can be borrowed against.",
    chart: {
      pairLabel: "BTC/USD",
      liquidationPriceLabel: "Liquidation Price",
      currentPriceLabel: "Current Price",
    },
  },
  activity: {
    pageTitle: "Activity",
    filterAll: "Show all",
    // Visible filter options in dropdown order
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
    // Row type labels (the transaction-type column). Pending Deposit reads as a
    // normal "Deposit"; keep this exhaustive with the ActivityType union.
    typeLabels: {
      Deposit: "Deposit",
      Withdraw: "Withdraw",
      Borrow: "Borrow",
      Repay: "Repay",
      Redeem: "Redeem",
      "Partially Liquidated": "Partially Liquidated",
      "Fully Liquidated": "Fully Liquidated",
      "Pending Deposit": "Deposit",
    } satisfies Record<ActivityType, string>,
    hashPending: "Pending…",
    // Accessible name for the v3 row's hash link, which opens the explorer.
    viewTransaction: (chain: string, hash: string) =>
      `View ${chain} transaction ${hash} in explorer`,
    // Labels for the two child rows nested inside a LiquidationGroupRow.
    liquidation: {
      collateralLabel: "Collateral Liquidated",
      repaidLabel: "Loan Repaid",
    },
    emptyDisconnected: connectToView("activity"),
    emptyFiltered: "No activity",
    // The empty state matches the shared EmptyState card; status labels are
    // derived from the row type plus pending/expired (a deposit's collateral is
    // "In use", every other settled action is "Done"); date-group headers label
    // the rows by day.
    emptyV3Title: "No activity yet",
    emptyV3Body:
      "Your account activity will appear here once you start using Babylon",
    statusPending: "Pending",
    statusExpired: "Expired",
    statusInUse: "In use",
    statusDone: "Done",
    dateToday: "Today",
    dateYesterday: "Yesterday",
  },
  banner: {
    addCollateral: "Add Collateral",
    repayDebt: "Repay Debt",
    applyOptimalOrder: "Apply Optimal Order",
    addSacrificialVault: "Add sacrificial BTC Vault",
  },
  geoBlock: {
    title: "Service unavailable in your region",
    body: "We're unable to provide access from your current region due to regulatory restrictions.",
  },
  reorder: {
    confirmButton: "Confirm",
    doneButton: "Done",
    successTitle: "BTC Vault order updated",
    successText: "The liquidation order of your BTC Vaults has been updated.",
  },
  protocolFees: {
    sectionTitle: "Protocol Parameters",
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
  // Operator-controlled protocol governance-status banners (Freeze / Pause). The
  // body may be overridden per incident via NEXT_PUBLIC_NOTICE_BANNER_MESSAGE;
  // these are the defaults.
  //
  // INTERIM copy: states only what the dApp currently *enforces* (new deposits
  // and borrows are disabled — see `isDepositBlocked` / `isBorrowBlocked`). The
  // wording deliberately does not claim the remaining ops are blocked yet; those
  // gates land with the Freeze (reorder) and Pause (withdraw/repay/activation/…)
  // follow-ups, and the final freeze/pause wording is owned by design.
  // Per-scope accuracy constraint: gating is per-scope, so the wording is
  // deliberately non-specific — an aave-only freeze leaves deposits working, so
  // naming specific actions would be inaccurate. Keyed by ProtocolStatus.
  protocolStatusV3: {
    frozen: {
      title: "Protocol is soft-paused",
      body: "Some new actions are temporarily restricted while the protocol is soft-paused. Any unavailable action is disabled and explains why. Your exits — repay, withdraw, and activation — stay available.",
    },
    paused: {
      title: "Protocol is fully paused",
      body: "Some actions are temporarily unavailable while the protocol is fully paused. Any unavailable action is disabled and explains why. Debt continues accruing interest — monitor official announcements.",
    },
  },
  // Full-width critical banner rendered above the header when the position is at
  // imminent liquidation risk (red severity). The warning glyph is supplied via
  // the banner's icon slot, not the message string.
  topBanner: {
    critical: (distancePct: string) =>
      `Critical — liquidation in ${distancePct}`,
    liquidatable: "Critical — liquidation can trigger now",
  },
  // Liquidation-notification warnings shown in the position banner. Mirrors the
  // warning types produced by the calculator: urgent / cliff / reorder / dust /
  // weird-params / too-many-vaults. Wording is ported from the reference
  // liquidation calculator (the source of truth for this copy).
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
    // Single reorder notification (matches Figma 6502-111184). Emitted whenever
    // the calculator finds a strictly safer order than the current one; the
    // suggested order is rendered as chips from `optimalVaultOrder`, not text.
    reorder: {
      title: "Reorder BTC Vaults to lose less",
      detail:
        "A different BTC Vault order makes the first liquidation event smaller — less BTC seized when it triggers.",
      suggestedOrderLabel: "Suggested order",
      vaultChip: (name: string, amount: string) => `${name} · ${amount}`,
    },
    // Cliff: all vaults consolidate into one liquidation group, so partial
    // liquidation is no longer possible. One Figma title/body across every case
    // (CLIFF A 6502-110902 / CLIFF B 7064-77201); only the suggestion varies by
    // what action is feasible.
    cliff: {
      title: "First liquidation takes everything",
      body: "With your current BTC Vaults, a single liquidation event seizes all your BTC — nothing remains protected behind it.",
      // Header shown above the suggestion text when there is no actionable CTA
      // (the withdraw/re-deposit and multi-vault cases). Rendered uppercase.
      suggestionLabel: "Suggestion",
      // Variant A (#1948): an affordable sacrificial vault buffers the existing
      // position. The amount lives here; the CTA label stays generic.
      addSacrificialSuggestion: (sacrificialBtc: string) =>
        `Adding a sacrificial ${sacrificialBtc} BTC Vault creates a buffer — it gets liquidated first, your existing BTC survives.`,
      // Variant B (#1949): the single vault is too large to buffer cheaply —
      // withdraw it and re-deposit as two smaller vaults instead.
      withdrawResplitSuggestion: (
        withdrawBtc: string,
        sacrificialBtc: string,
        protectedBtc: string,
      ) =>
        `To enable partial liquidation, withdraw your ${withdrawBtc} BTC and re-deposit as two smaller BTC Vaults: ${sacrificialBtc} BTC sacrificial + ${protectedBtc} BTC protected. Alternatively: add collateral or repay debt to manage the liquidation.`,
      // Protocol params disallow splitting entirely — no re-split is possible.
      noSplitSuggestion:
        "Current protocol parameters do not allow BTC Vault splitting as a protection strategy. Add collateral or repay part of the debt to keep this position safe.",
      // 2-vault / 3+ cliffs share the title/body/severity but keep their
      // structural suggestion, since "re-deposit as two smaller vaults" doesn't
      // apply when you already hold multiple vaults.
      twoVault: {
        enablePartial: (deficitBtc: string, largestName: string) =>
          `To enable partial liquidation, add ≥ ${deficitBtc} BTC alongside ${largestName}. `,
        suggestion: (targetSeizureBtc: string, enablePartialStr: string) =>
          `Neither BTC Vault alone covers the target seizure (${targetSeizureBtc} BTC). ${enablePartialStr}You can also add collateral or repay part of the debt to keep this position safe. Alternatively: repay the loan, split BTC into optimal UTXOs, and re-open with a sacrificial BTC Vault.`,
      },
      multiVault: {
        suggestion: (
          nVaults: number,
          hasReorderFix: boolean,
          orderStr: string,
        ) =>
          hasReorderFix
            ? `All ${nVaults} BTC Vaults land in the first liquidation group. Reordering BTC Vaults will fix this — suggested order: ${orderStr}.`
            : `All ${nVaults} BTC Vaults land in the first liquidation group, and no combination of BTC Vaults covers the target seizure alone. Add collateral or repay part of the debt to keep this position safe.`,
      },
    },
    // Too many vaults: beyond the optimizer cap, ordering falls back to a
    // largest-first heuristic and the reorder suggestion is no longer optimal.
    // Copy matches Figma 7048-61969 (count + cap stay interpolated).
    tooManyVaults: {
      title: "Too many BTC Vaults to optimize",
      detail: (nVaults: number, cap: number) =>
        `You have ${nVaults} BTC Vaults. Beyond ${cap}, the optimizer can't guarantee the best liquidation order — it falls back to a simpler largest-first approach. Your liquidation risk data is still accurate, but the order may not be optimal.`,
      suggestion:
        "Consider consolidating smaller BTC Vaults into fewer larger ones — fewer BTC Vaults means lower fees and better optimization.",
    },
    maxVaults: {
      // Figma v3 §9 verbatim: the title drops the "BTC" qualifier the body keeps.
      titleV3: "Maximum vaults reached",
      detail: (cap: number) =>
        `This position already has the maximum number of BTC Vaults (${cap}).`,
    },
    dust: {
      title: "Position too small for BTC Vault analysis",
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
