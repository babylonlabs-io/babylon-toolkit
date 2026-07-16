/* tslint:disable */
/* eslint-disable */

/**
 * The P2A (pay-to-anchor) output a canonical PegIn reserves under one tx
 * graph version: value in satoshis, output index, and scriptPubKey hex.
 */
export class PeginP2aAnchorOutput {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Hex-encoded anchor scriptPubKey (`51024e73`, the BIP-431
     * pay-to-anchor script).
     */
    readonly scriptPubKey: string;
    /**
     * Anchor value in satoshis (240, [`btc_vault_v2::P2A_ANCHOR_VALUE`] on
     * graph v2). The front-end needs this to reproduce the HTLC value
     * decomposition (amount + depositor claim + anchor + pegin fee).
     */
    readonly value: bigint;
    /**
     * Output index of the anchor (2, [`btc_vault_v2::P2A_ANCHOR_VOUT`] on
     * graph v2) — read it from here instead of assuming the position.
     */
    readonly vout: number;
}

/**
 * WASM wrapper for the Assert challenge/assert connector, built for the
 * requested tx graph version.
 */
export class WasmAssertChallengeAssertConnector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns the taproot address for this connector.
     */
    getAddress(network: string): string;
    /**
     * Returns the control block for the script path as hex.
     */
    getControlBlock(): string;
    /**
     * Returns the challenge/assert script as hex.
     */
    getScript(): string;
    /**
     * The tx graph version this connector was built for.
     */
    getTxGraphVersion(): number;
    /**
     * Creates a new AssertChallengeAssertConnector for `tx_graph_version`.
     *
     * # Arguments
     *
     * * `tx_graph_version` - Tx graph version (fresh: `activeVaultCoreVersion()`; resume: the vault's stamped version)
     * * `claimer` - Hex-encoded claimer public key (64 chars)
     * * `challenger` - Hex-encoded challenger public key (64 chars)
     * * `claimer_wots_keys_json` - Serialized claimer WOTS public keys JSON
     * * `gc_wots_keys_json` - Serialized garbled-circuit WOTS public keys JSON
     */
    constructor(tx_graph_version: number, claimer: string, challenger: string, claimer_wots_keys_json: string, gc_wots_keys_json: string);
}

/**
 * WASM wrapper for the Assert payout/no-payout connector, built for the
 * requested tx graph version.
 */
export class WasmAssertPayoutNoPayoutConnector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns the taproot address for this connector.
     */
    getAddress(network: string): string;
    /**
     * Returns the control block for the no-payout script path of
     * `challenger` as hex.
     */
    getNoPayoutControlBlock(challenger: string): string;
    /**
     * Returns the no-payout script for `challenger` as hex.
     */
    getNoPayoutScript(challenger: string): string;
    /**
     * Returns the control block for the payout script path as hex.
     */
    getPayoutControlBlock(): string;
    /**
     * Returns the payout script as hex.
     */
    getPayoutScript(): string;
    /**
     * Returns the scriptPubKey as hex.
     */
    getScriptPubKey(network: string): string;
    /**
     * The tx graph version this connector was built for.
     */
    getTxGraphVersion(): number;
    /**
     * Creates a new AssertPayoutNoPayoutConnector for `tx_graph_version`.
     *
     * # Arguments
     *
     * * `tx_graph_version` - Tx graph version (fresh: `activeVaultCoreVersion()`; resume: the vault's stamped version)
     * * `claimer` - Hex-encoded claimer public key (64 chars)
     * * `local_challengers` - Array of hex-encoded local challenger public keys
     * * `universal_challengers` - Array of hex-encoded universal challenger public keys
     * * `timelock_assert` - CSV timelock in blocks for the payout path
     * * `council_members` - Array of hex-encoded council member public keys
     * * `council_quorum` - M in M-of-N council multisig
     */
    constructor(tx_graph_version: number, claimer: string, local_challengers: string[], universal_challengers: string[], timelock_assert: number, council_members: string[], council_quorum: number);
}

/**
 * A Payout transaction, built for the requested tx graph version.
 */
export class WasmPayoutTx {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Estimates the Payout vsize under `tx_graph_version` for fee planning.
     */
    static estimateVsize(tx_graph_version: number, num_vault_keepers: number, num_universal_challengers: number, num_local_challengers: number, council_size: number, commission_json?: string | null): bigint;
    /**
     * Creates a WasmPayoutTx from a JSON string serialized under
     * `tx_graph_version`.
     *
     * Payout transactions have the same wire shape under both supported
     * tx graph versions, so unlike `WasmPeginTx.fromJson` there is no
     * structural cross-check — the caller-supplied version selects the
     * deserializer and is stamped on the result.
     */
    static fromJson(tx_graph_version: number, json: string): WasmPayoutTx;
    /**
     * The tx graph version this Payout was built for.
     */
    getTxGraphVersion(): number;
    /**
     * Returns the transaction ID.
     */
    getTxid(): string;
    /**
     * Constructs a Payout transaction for `tx_graph_version`.
     *
     * `pegin_tx_json` must have been serialized under the same tx graph
     * version — its embedded transaction shape is checked and a mismatch
     * fails closed.
     *
     * # Arguments
     *
     * * `tx_graph_version` - Tx graph version (fresh: `activeVaultCoreVersion()`; resume: the vault's stamped version)
     * * `pegin_tx_json` - Serialized PegInTx JSON
     * * `assert_tx_json` - Serialized AssertTx JSON
     * * `payout_btc_address_hex` - Hex-encoded payout scriptPubKey
     * * `fee` - Payout fee in satoshis
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * * `commission_json` - Optional serialized Commission JSON
     */
    constructor(tx_graph_version: number, pegin_tx_json: string, assert_tx_json: string, payout_btc_address_hex: string, fee: bigint, network: string, commission_json?: string | null);
    /**
     * Returns the transaction as hex-encoded bytes.
     */
    toHex(): string;
    /**
     * Returns the serialized PayoutTx as JSON.
     */
    toJson(): string;
}

/**
 * WASM wrapper for PeginPayoutConnector — the spending conditions of the
 * PegIn output, built for the requested tx graph version.
 */
export class WasmPeginPayoutConnector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns the taproot address for this connector.
     */
    getAddress(network: string): string;
    /**
     * Returns the control block for the payout script path as hex.
     */
    getPayoutControlBlock(): string;
    /**
     * Returns the payout script as hex.
     */
    getPayoutScript(): string;
    /**
     * Returns the scriptPubKey as hex.
     */
    getScriptPubKey(network: string): string;
    /**
     * Returns the taproot script hash as hex.
     */
    getTaprootScriptHash(): string;
    /**
     * The tx graph version this connector was built for.
     */
    getTxGraphVersion(): number;
    /**
     * Creates a new PeginPayoutConnector for `tx_graph_version`.
     *
     * # Arguments
     *
     * * `tx_graph_version` - Tx graph version (fresh: `activeVaultCoreVersion()`; resume: the vault's stamped version)
     * * `depositor` - Hex-encoded depositor public key (64 chars)
     * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
     * * `vault_keepers` - Array of hex-encoded vault keeper public keys
     * * `universal_challengers` - Array of hex-encoded universal challenger public keys
     * * `timelock_pegin` - CSV timelock (P = t3) in blocks for the PegIn output
     */
    constructor(tx_graph_version: number, depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[], timelock_pegin: number);
}

/**
 * An unfunded PegIn transaction that locks funds into the vault.
 *
 * Built via `WasmPrePeginTx.buildPeginTx` or deserialized with `fromJson`;
 * there is no public constructor.
 */
export class WasmPeginTx {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Creates a WasmPeginTx from a JSON string serialized under
     * `tx_graph_version`.
     *
     * Fails closed if the embedded transaction shape does not match the
     * requested tx graph version (the JSON of one version would otherwise
     * silently deserialize under another).
     */
    static fromJson(tx_graph_version: number, json: string): WasmPeginTx;
    /**
     * The tx graph version this PegIn was built for.
     */
    getTxGraphVersion(): number;
    /**
     * Returns the transaction ID.
     */
    getTxid(): string;
    /**
     * Returns the vault scriptPubKey as hex.
     */
    getVaultScriptPubKey(): string;
    /**
     * Returns the vault output value in satoshis.
     */
    getVaultValue(): bigint;
    /**
     * Returns the transaction as hex-encoded bytes.
     */
    toHex(): string;
    /**
     * Returns the serialized PegInTx as JSON.
     */
    toJson(): string;
}

/**
 * WASM wrapper for PrePeginHtlcConnector — the spending conditions of the
 * Pre-PegIn HTLC output, built for the requested tx graph version.
 */
export class WasmPrePeginHtlcConnector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns the taproot address for this connector.
     */
    getAddress(network: string): string;
    /**
     * Returns the control block for the hashlock script path as hex.
     */
    getHashlockControlBlock(): string;
    /**
     * Returns the hashlock script as hex.
     */
    getHashlockScript(): string;
    /**
     * Returns the control block for the refund script path as hex.
     */
    getRefundControlBlock(): string;
    /**
     * Returns the refund script as hex.
     */
    getRefundScript(): string;
    /**
     * Returns the scriptPubKey as hex.
     */
    getScriptPubKey(network: string): string;
    /**
     * The tx graph version this connector was built for.
     */
    getTxGraphVersion(): number;
    /**
     * Creates a new PrePeginHtlcConnector for `tx_graph_version`.
     *
     * # Arguments
     *
     * * `tx_graph_version` - Tx graph version (fresh: `activeVaultCoreVersion()`; resume: the vault's stamped version)
     * * `depositor` - Hex-encoded depositor public key (64 chars)
     * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
     * * `vault_keepers` - Array of hex-encoded vault keeper public keys
     * * `universal_challengers` - Array of hex-encoded universal challenger public keys
     * * `hashlock` - Hex-encoded SHA256 hash commitment (64 chars)
     * * `timelock_refund` - CSV timelock for the refund path (must be non-zero)
     */
    constructor(tx_graph_version: number, depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[], hashlock: string, timelock_refund: number);
}

/**
 * A Pre-PegIn transaction with one or more HTLC outputs, built for the
 * requested tx graph version.
 */
export class WasmPrePeginTx {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Builds the PegIn transaction spending the HTLC at `htlc_vout`,
     * preserving the tx graph version.
     */
    buildPeginTx(timelock_pegin: number, htlc_vout: number): WasmPeginTx;
    /**
     * Builds the refund transaction for the HTLC at `htlc_vout`.
     */
    buildRefundTx(refund_fee: bigint, htlc_vout: number): string;
    /**
     * Returns a copy of this Pre-PegIn with inputs/change applied from a
     * funded raw transaction, preserving the tx graph version.
     */
    fromFundedTransaction(funded_tx_hex: string): WasmPrePeginTx;
    /**
     * Returns the depositor claim value in satoshis.
     */
    getDepositorClaimValue(): bigint;
    /**
     * Returns the HTLC address at `htlc_vout`.
     */
    getHtlcAddress(htlc_vout: number): string;
    /**
     * Returns the HTLC scriptPubKey at `htlc_vout` as hex.
     */
    getHtlcScriptPubKey(htlc_vout: number): string;
    /**
     * Returns the HTLC output value at `htlc_vout` in satoshis.
     */
    getHtlcValue(htlc_vout: number): bigint;
    /**
     * Returns the number of HTLC outputs.
     */
    getNumHtlcs(): number;
    /**
     * Returns the pegin amount at `htlc_vout` in satoshis.
     */
    getPeginAmountAt(htlc_vout: number): bigint;
    /**
     * The tx graph version this Pre-PegIn was built for.
     */
    getTxGraphVersion(): number;
    /**
     * Returns the transaction ID.
     */
    getTxid(): string;
    /**
     * Creates a new unfunded Pre-PegIn transaction for `tx_graph_version`.
     *
     * # Arguments
     *
     * * `tx_graph_version` - Tx graph version (fresh: `activeVaultCoreVersion()`; resume: the vault's stamped version)
     * * `depositor` - Hex-encoded depositor public key (64 chars)
     * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
     * * `vault_keepers` - Array of hex-encoded vault keeper public keys
     * * `universal_challengers` - Array of hex-encoded universal challenger public keys
     * * `hashlocks` - Array of hex-encoded SHA256 hash commitments (64 hex chars each)
     * * `pegin_amounts` - Array of pegin amounts in satoshis (one per hashlock)
     * * `timelock_refund` - CSV timelock for the refund path (must be non-zero)
     * * `fee_rate` - TX-graph fee rate in sat/vB; sizes `depositor_claim_value`
     * * `min_pegin_fee_rate` - Minimum PegIn fee rate in sat/vB; sizes the PegIn tx fee
     * * `num_local_challengers` - Number of local challengers (from contract params)
     * * `council_quorum` - M in M-of-N council multisig (from contract params)
     * * `council_size` - N in M-of-N council multisig (from contract params)
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * * `auth_anchor_hash` - Optional hex-encoded auth anchor hash
     */
    constructor(tx_graph_version: number, depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[], hashlocks: string[], pegin_amounts: BigUint64Array, timelock_refund: number, fee_rate: bigint, min_pegin_fee_rate: bigint, num_local_challengers: number, council_quorum: number, council_size: number, network: string, auth_anchor_hash?: string | null);
    /**
     * Returns the transaction as hex-encoded bytes.
     */
    toHex(): string;
}

/**
 * Computes the Assert claimer sighashes over a serialized TxGraph under
 * `tx_graph_version`.
 */
export function computeAssertClaimerSighashes(tx_graph_version: number, graph_json: string): string;

/**
 * Computes the minimum depositor claim value under `tx_graph_version`.
 */
export function computeMinClaimValue(tx_graph_version: number, num_local_challengers: number, num_universal_challengers: number, council_quorum: number, council_size: number, fee_rate: bigint): bigint;

/**
 * Computes the minimum PegIn fee under `tx_graph_version`.
 */
export function computeMinPeginFee(tx_graph_version: number, num_vks: number, num_ucs: number, min_pegin_fee_rate: bigint): bigint;

/**
 * Computes the NoPayout claimer sighash over a serialized TxGraph under
 * `tx_graph_version`.
 */
export function computeNoPayoutClaimerSighash(tx_graph_version: number, graph_json: string, challenger_pk_hex: string): string;

/**
 * Computes the Payout claimer sighash over a serialized TxGraph under
 * `tx_graph_version`.
 */
export function computePayoutClaimerSighash(tx_graph_version: number, graph_json: string): string;

/**
 * Computes the Payout depositor sighash over a serialized TxGraph under
 * `tx_graph_version`.
 */
export function computePayoutDepositorSighash(tx_graph_version: number, graph_json: string): string;

/**
 * Computes the PegIn input sighash under `tx_graph_version`.
 *
 * `pegin_json` must have been serialized under the same tx graph version —
 * its embedded transaction shape is checked and a mismatch fails closed.
 */
export function computePeginInputSighash(tx_graph_version: number, pegin_json: string, htlc_connector_json: string, prepegin_htlc_output_json: string): string;

/**
 * Derive the on-chain vault identifier matching the Solidity logic:
 *
 * ```solidity
 * keccak256(abi.encode(peginTxHash, depositor))
 * ```
 *
 * # Arguments
 * * `pegin_tx_hash` - 32-byte peginTxHash in display (big-endian) byte order
 * * `depositor` - 20-byte Ethereum address of the depositor
 *
 * # Returns
 * 32-byte vault identifier (hex-encoded string)
 */
export function deriveVaultId(pegin_tx_hash: Uint8Array, depositor: Uint8Array): string;

/**
 * Derive the 32-byte `authAnchor` shared across a Pre-PegIn (frozen, on-chain-binding).
 */
export function expandAuthAnchor(root: Uint8Array): Uint8Array;

/**
 * Derive the 32-byte `hashlockSecret` for HTLC `htlcVout` (frozen, on-chain-binding).
 */
export function expandHashlockSecret(root: Uint8Array, htlc_vout: number): Uint8Array;

/**
 * Derive the 64-byte `wotsSeed` for HTLC `htlcVout` (frozen, on-chain-binding).
 */
export function expandWotsSeed(root: Uint8Array, htlc_vout: number): Uint8Array;

/**
 * Initialize panic hook for better error messages in the browser console.
 */
export function init_panic_hook(): void;

/**
 * Returns the P2A anchor output a canonical PegIn reserves under
 * `tx_graph_version`, or `undefined` for versions whose PegIns carry no
 * anchor (graph v1) — one record instead of per-field defaults, so an
 * absent anchor cannot be mistaken for a zero-valued one.
 */
export function peginP2aAnchorOutput(tx_graph_version: number): PeginP2aAnchorOutput | undefined;

/**
 * Tx graph versions this binary can build, ascending. Front-end
 * pre-flight: show "unsupported app version" UX instead of catching
 * per-call errors.
 */
export function supportedTxGraphVersions(): Uint16Array;

/**
 * Validates the P2A anchor shape of a hex-encoded PegIn transaction under
 * `tx_graph_version`, per that version's anchor rule (see
 * `check_pegin_p2a_anchor` in each version's module).
 *
 * Graph v2: the output at [`btc_vault_v2::P2A_ANCHOR_VOUT`] must exist,
 * carry the P2A scriptPubKey, and hold exactly
 * [`btc_vault_v2::P2A_ANCHOR_VALUE`] sats. Graph v1: the transaction must
 * carry no P2A output at all — so a graph-v2 PegIn checked under v1 fails
 * closed instead of validating vacuously.
 */
export function validatePeginP2aAnchor(tx_graph_version: number, tx_hex: string): void;

/**
 * Validates serialized TxGraph parameters under `tx_graph_version`.
 */
export function validateTxGraphParams(tx_graph_version: number, params_json: string): void;

/**
 * Verifies claimer presignatures over a serialized TxGraph under
 * `tx_graph_version`.
 */
export function verifyClaimerPresignatures(tx_graph_version: number, graph_json: string, claimer_pk_hex: string, presigs_json: string): void;

/**
 * Verifies the depositor payout signature over a serialized TxGraph under
 * `tx_graph_version`.
 */
export function verifyDepositorSignature(tx_graph_version: number, graph_json: string, depositor_pk_hex: string, payout_sig_hex: string): void;

/**
 * Verifies a P2TR script-spend signature under `tx_graph_version`.
 */
export function verifyP2trScriptSpendSignature(tx_graph_version: number, tx_hex: string, input_index: number, prevouts_json: string, script_hex: string, pubkey_hex: string, signature_hex: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly supportedTxGraphVersions: () => [number, number];
    readonly validateTxGraphParams: (a: number, b: number, c: number) => [number, number];
    readonly verifyClaimerPresignatures: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly verifyP2trScriptSpendSignature: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number];
    readonly __wbg_peginp2aanchoroutput_free: (a: number, b: number) => void;
    readonly __wbg_wasmpegintx_free: (a: number, b: number) => void;
    readonly computeMinPeginFee: (a: number, b: number, c: number, d: bigint) => [bigint, number, number];
    readonly computePeginInputSighash: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly peginP2aAnchorOutput: (a: number) => [number, number, number];
    readonly peginp2aanchoroutput_scriptPubKey: (a: number) => [number, number];
    readonly peginp2aanchoroutput_value: (a: number) => bigint;
    readonly peginp2aanchoroutput_vout: (a: number) => number;
    readonly validatePeginP2aAnchor: (a: number, b: number, c: number) => [number, number];
    readonly wasmpegintx_fromJson: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmpegintx_getTxGraphVersion: (a: number) => number;
    readonly wasmpegintx_getTxid: (a: number) => [number, number];
    readonly wasmpegintx_getVaultScriptPubKey: (a: number) => [number, number];
    readonly wasmpegintx_getVaultValue: (a: number) => bigint;
    readonly wasmpegintx_toHex: (a: number) => [number, number];
    readonly wasmpegintx_toJson: (a: number) => [number, number, number, number];
    readonly __wbg_wasmassertpayoutnopayoutconnector_free: (a: number, b: number) => void;
    readonly computeAssertClaimerSighashes: (a: number, b: number, c: number) => [number, number, number, number];
    readonly computeNoPayoutClaimerSighash: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly wasmassertpayoutnopayoutconnector_getAddress: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmassertpayoutnopayoutconnector_getNoPayoutControlBlock: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmassertpayoutnopayoutconnector_getNoPayoutScript: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmassertpayoutnopayoutconnector_getPayoutControlBlock: (a: number) => [number, number, number, number];
    readonly wasmassertpayoutnopayoutconnector_getPayoutScript: (a: number) => [number, number];
    readonly wasmassertpayoutnopayoutconnector_getScriptPubKey: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmassertpayoutnopayoutconnector_getTxGraphVersion: (a: number) => number;
    readonly wasmassertpayoutnopayoutconnector_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
    readonly __wbg_wasmpeginpayoutconnector_free: (a: number, b: number) => void;
    readonly wasmpeginpayoutconnector_getAddress: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmpeginpayoutconnector_getPayoutControlBlock: (a: number) => [number, number, number, number];
    readonly wasmpeginpayoutconnector_getPayoutScript: (a: number) => [number, number];
    readonly wasmpeginpayoutconnector_getScriptPubKey: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmpeginpayoutconnector_getTaprootScriptHash: (a: number) => [number, number];
    readonly wasmpeginpayoutconnector_getTxGraphVersion: (a: number) => number;
    readonly wasmpeginpayoutconnector_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly __wbg_wasmpayouttx_free: (a: number, b: number) => void;
    readonly computePayoutClaimerSighash: (a: number, b: number, c: number) => [number, number, number, number];
    readonly computePayoutDepositorSighash: (a: number, b: number, c: number) => [number, number, number, number];
    readonly verifyDepositorSignature: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly wasmpayouttx_estimateVsize: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [bigint, number, number];
    readonly wasmpayouttx_fromJson: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmpayouttx_getTxGraphVersion: (a: number) => number;
    readonly wasmpayouttx_getTxid: (a: number) => [number, number];
    readonly wasmpayouttx_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint, i: number, j: number, k: number, l: number) => [number, number, number];
    readonly wasmpayouttx_toHex: (a: number) => [number, number];
    readonly wasmpayouttx_toJson: (a: number) => [number, number, number, number];
    readonly __wbg_wasmassertchallengeassertconnector_free: (a: number, b: number) => void;
    readonly deriveVaultId: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly expandAuthAnchor: (a: number, b: number) => [number, number, number, number];
    readonly expandHashlockSecret: (a: number, b: number, c: number) => [number, number, number, number];
    readonly expandWotsSeed: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmassertchallengeassertconnector_getAddress: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmassertchallengeassertconnector_getControlBlock: (a: number) => [number, number, number, number];
    readonly wasmassertchallengeassertconnector_getScript: (a: number) => [number, number, number, number];
    readonly wasmassertchallengeassertconnector_getTxGraphVersion: (a: number) => number;
    readonly wasmassertchallengeassertconnector_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly init_panic_hook: () => void;
    readonly __wbg_wasmprepeginhtlcconnector_free: (a: number, b: number) => void;
    readonly wasmprepeginhtlcconnector_getAddress: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmprepeginhtlcconnector_getHashlockControlBlock: (a: number) => [number, number, number, number];
    readonly wasmprepeginhtlcconnector_getHashlockScript: (a: number) => [number, number];
    readonly wasmprepeginhtlcconnector_getRefundControlBlock: (a: number) => [number, number, number, number];
    readonly wasmprepeginhtlcconnector_getRefundScript: (a: number) => [number, number];
    readonly wasmprepeginhtlcconnector_getScriptPubKey: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmprepeginhtlcconnector_getTxGraphVersion: (a: number) => number;
    readonly wasmprepeginhtlcconnector_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number];
    readonly __wbg_wasmprepegintx_free: (a: number, b: number) => void;
    readonly computeMinClaimValue: (a: number, b: number, c: number, d: number, e: number, f: bigint) => [bigint, number, number];
    readonly wasmprepegintx_buildPeginTx: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmprepegintx_buildRefundTx: (a: number, b: bigint, c: number) => [number, number, number, number];
    readonly wasmprepegintx_fromFundedTransaction: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmprepegintx_getDepositorClaimValue: (a: number) => bigint;
    readonly wasmprepegintx_getHtlcAddress: (a: number, b: number) => [number, number, number, number];
    readonly wasmprepegintx_getHtlcScriptPubKey: (a: number, b: number) => [number, number, number, number];
    readonly wasmprepegintx_getHtlcValue: (a: number, b: number) => [bigint, number, number];
    readonly wasmprepegintx_getNumHtlcs: (a: number) => number;
    readonly wasmprepegintx_getPeginAmountAt: (a: number, b: number) => [bigint, number, number];
    readonly wasmprepegintx_getTxGraphVersion: (a: number) => number;
    readonly wasmprepegintx_getTxid: (a: number) => [number, number];
    readonly wasmprepegintx_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: bigint, p: bigint, q: number, r: number, s: number, t: number, u: number, v: number, w: number) => [number, number, number];
    readonly wasmprepegintx_toHex: (a: number) => [number, number];
    readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
    readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
    readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
