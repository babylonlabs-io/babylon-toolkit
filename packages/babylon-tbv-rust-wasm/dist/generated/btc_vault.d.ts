/* tslint:disable */
/* eslint-disable */

/**
 * WASM wrapper for AssertChallengeAssertConnector.
 *
 * This connector defines the spending conditions for Assert outputs (blocks 0–1),
 * used by ChallengeAssert-A transactions to prove invalid assertions.
 */
export class WasmAssertChallengeAssertConnector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns the Taproot address for the connector.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     */
    getAddress(network: string): string;
    /**
     * Returns the control block as hex.
     */
    getControlBlock(): string;
    /**
     * Returns the ChallengeAssert-A script as hex.
     */
    getScript(): string;
    /**
     * Creates a new AssertChallengeAssertConnector.
     *
     * # Arguments
     *
     * * `claimer` - Hex-encoded claimer public key (64 chars)
     * * `challenger` - Hex-encoded challenger public key (64 chars)
     * * `claimer_wots_keys_json` - JSON string of the claimer's WOTS public keys (blocks 0–1)
     * * `gc_wots_keys_json` - JSON string of the GC WOTS public keys (array of arrays, one per GC)
     */
    constructor(claimer: string, challenger: string, claimer_wots_keys_json: string, gc_wots_keys_json: string);
}

/**
 * WASM wrapper for AssertPayoutNoPayoutCouncilNoPayoutConnector.
 *
 * This connector defines the spending conditions for Assert output 0,
 * supporting Payout, NoPayout (per challenger), and CouncilNoPayout paths.
 */
export class WasmAssertPayoutNoPayoutConnector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns the Taproot address for the connector.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     */
    getAddress(network: string): string;
    /**
     * Returns the NoPayout control block as hex for a specific challenger.
     *
     * # Arguments
     *
     * * `challenger` - Hex-encoded challenger public key (64 chars)
     */
    getNoPayoutControlBlock(challenger: string): string;
    /**
     * Returns the NoPayout script as hex for a specific challenger.
     *
     * # Arguments
     *
     * * `challenger` - Hex-encoded challenger public key (64 chars)
     */
    getNoPayoutScript(challenger: string): string;
    /**
     * Returns the payout control block as hex.
     */
    getPayoutControlBlock(): string;
    /**
     * Returns the payout script as hex (Leaf 0: Claimer + Challengers + Timelock).
     */
    getPayoutScript(): string;
    /**
     * Returns the Taproot scriptPubKey as hex.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     */
    getScriptPubKey(network: string): string;
    /**
     * Creates a new AssertPayoutNoPayoutConnector.
     *
     * # Arguments
     *
     * * `claimer` - Hex-encoded claimer public key (64 chars)
     * * `local_challengers` - Array of hex-encoded local challenger public keys
     * * `universal_challengers` - Array of hex-encoded universal challenger public keys
     * * `timelock_assert` - Timelock for assert period in blocks (must be non-zero)
     * * `council_members` - Array of hex-encoded council member public keys
     * * `council_quorum` - Number of council members required for quorum
     */
    constructor(claimer: string, local_challengers: string[], universal_challengers: string[], timelock_assert: number, council_members: string[], council_quorum: number);
}

/**
 * WASM wrapper for PayoutTx.
 *
 * Represents a Payout transaction that releases funds after a successful
 * challenge resolution (Assert path).
 */
export class WasmPayoutTx {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Estimates the virtual size of a Payout transaction.
     *
     * # Arguments
     *
     * * `num_vault_keepers` - Number of vault keepers
     * * `num_universal_challengers` - Number of universal challengers
     * * `num_local_challengers` - Number of local challengers
     * * `council_size` - Number of council members
     * * `commission_json` - Optional JSON string of the Commission (null/undefined for no commission)
     */
    static estimateVsize(num_vault_keepers: number, num_universal_challengers: number, num_local_challengers: number, council_size: number, commission_json?: string | null): bigint;
    /**
     * Creates a WasmPayoutTx from a JSON string.
     */
    static fromJson(json: string): WasmPayoutTx;
    /**
     * Returns the transaction ID.
     */
    getTxid(): string;
    /**
     * Creates a new Payout transaction.
     *
     * # Arguments
     *
     * * `pegin_tx_json` - JSON string of the PegInTx
     * * `assert_tx_json` - JSON string of the AssertTx
     * * `payout_btc_address_hex` - Hex-encoded scriptPubKey of the payout receiver
     * * `fee` - Transaction fee in satoshis
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * * `commission_json` - Optional JSON string of the Commission (null/undefined for no commission)
     */
    constructor(pegin_tx_json: string, assert_tx_json: string, payout_btc_address_hex: string, fee: bigint, network: string, commission_json?: string | null);
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
 * WASM wrapper for PeginPayoutConnector.
 *
 * This connector defines the spending conditions for the PegIn output.
 */
export class WasmPeginPayoutConnector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns the Taproot address for the connector.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     */
    getAddress(network: string): string;
    /**
     * Returns the payout control block as hex.
     *
     * The control block is needed for taproot script-path spending of the payout leaf.
     */
    getPayoutControlBlock(): string;
    /**
     * Returns the payout script as hex.
     */
    getPayoutScript(): string;
    /**
     * Returns the Taproot scriptPubKey as hex.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     */
    getScriptPubKey(network: string): string;
    /**
     * Returns the taproot script hash.
     */
    getTaprootScriptHash(): string;
    /**
     * Creates a new PeginPayoutConnector.
     *
     * # Arguments
     *
     * * `depositor` - Hex-encoded depositor public key (64 chars)
     * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
     * * `vault_keepers` - Array of hex-encoded vault keeper public keys
     * * `universal_challengers` - Array of hex-encoded universal challenger public keys
     * * `timelock_pegin` - CSV timelock (P = t3) in blocks for the PegIn output
     */
    constructor(depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[], timelock_pegin: number);
}

/**
 * WASM wrapper for PegInTx.
 *
 * Represents an unfunded PegIn transaction that locks funds into the vault.
 */
export class WasmPeginTx {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Creates a WasmPeginTx from a JSON string.
     */
    static fromJson(json: string): WasmPeginTx;
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
 * WASM wrapper for PrePeginHtlcConnector.
 *
 * This connector defines the spending conditions for the Pre-PegIn HTLC output.
 * The frontend uses `getHashlockScript()` and `getHashlockControlBlock()` to
 * build a PSBT for the depositor's signature over the PegIn input.
 */
export class WasmPrePeginHtlcConnector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns the Taproot address for the HTLC output.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     */
    getAddress(network: string): string;
    /**
     * Returns the hashlock control block as hex.
     *
     * The control block is needed for taproot script-path spending of the
     * hashlock leaf (leaf 0).
     */
    getHashlockControlBlock(): string;
    /**
     * Returns the hashlock + all-party spend script (leaf 0) as hex.
     */
    getHashlockScript(): string;
    /**
     * Returns the refund control block as hex.
     *
     * The control block is needed for taproot script-path spending of the
     * refund leaf (leaf 1).
     */
    getRefundControlBlock(): string;
    /**
     * Returns the refund script (leaf 1) as hex.
     */
    getRefundScript(): string;
    /**
     * Returns the Taproot scriptPubKey as hex.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     */
    getScriptPubKey(network: string): string;
    /**
     * Creates a new PrePeginHtlcConnector.
     *
     * # Arguments
     *
     * * `depositor` - Hex-encoded depositor public key (64 chars)
     * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
     * * `vault_keepers` - Array of hex-encoded vault keeper public keys
     * * `universal_challengers` - Array of hex-encoded universal challenger public keys
     * * `hashlock` - Hex-encoded SHA256 hash commitment (64 hex chars = 32 bytes)
     * * `timelock_refund` - CSV timelock for the refund path (must be non-zero)
     */
    constructor(depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[], hashlock: string, timelock_refund: number);
}

/**
 * WASM wrapper for PrePegInTx.
 *
 * Represents an unfunded Pre-PegIn transaction that locks BTC in an HTLC output.
 * Also serves as the entry point for deriving the PegIn and refund transactions.
 */
export class WasmPrePeginTx {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Builds the PegIn transaction that spends a Pre-PegIn HTLC output.
     *
     * The resulting transaction has a single input spending the HTLC at
     * `htlc_vout` via the hashlock + all-party script (leaf 0). The fee is
     * baked into the HTLC input/output difference.
     *
     * **Important:** This must be called on a funded `WasmPrePeginTx` (created
     * via `fromFundedTransaction`) so the PegIn input references the correct
     * Pre-PegIn txid.
     *
     * # Arguments
     *
     * * `timelock_pegin` - CSV timelock (P = t3) in blocks for the PegIn output
     * * `htlc_vout` - Index of the HTLC output within the Pre-PegIn transaction
     */
    buildPeginTx(timelock_pegin: number, htlc_vout: number): WasmPeginTx;
    /**
     * Builds an unsigned refund transaction that spends a Pre-PegIn HTLC
     * output via the refund script (leaf 1) after the timelock expires.
     *
     * The depositor signs this externally via their wallet.
     *
     * **Important:** This must be called on a funded `WasmPrePeginTx` (created
     * via `fromFundedTransaction`) so the refund input references the correct
     * Pre-PegIn txid.
     *
     * # Arguments
     *
     * * `refund_fee` - Transaction fee in satoshis
     * * `htlc_vout` - Index of the HTLC output within the Pre-PegIn transaction
     */
    buildRefundTx(refund_fee: bigint, htlc_vout: number): string;
    /**
     * Reconstructs a `WasmPrePeginTx` from a funded Pre-PegIn transaction.
     *
     * Call this after the depositor's wallet has funded the unfunded Pre-PegIn
     * (adding inputs). The resulting object has the correct txid and can be
     * used directly with `buildPeginTx` / `buildRefundTx`.
     *
     * The per-HTLC pegin amounts and depositor claim value are preserved from
     * the original unfunded object (`self`).
     *
     * # Arguments
     *
     * * `funded_tx_hex` - Hex-encoded funded Pre-PegIn transaction bytes
     */
    fromFundedTransaction(funded_tx_hex: string): WasmPrePeginTx;
    /**
     * Returns the depositor claim value in satoshis.
     */
    getDepositorClaimValue(): bigint;
    /**
     * Returns the HTLC Taproot address.
     */
    getHtlcAddress(htlc_vout: number): string;
    /**
     * Returns the HTLC output scriptPubKey as hex.
     */
    getHtlcScriptPubKey(htlc_vout: number): string;
    /**
     * Returns the HTLC output value in satoshis.
     */
    getHtlcValue(htlc_vout: number): bigint;
    /**
     * Returns the number of HTLC outputs in this Pre-PegIn transaction.
     */
    getNumHtlcs(): number;
    /**
     * Returns the pegin amount in satoshis for a specific HTLC output.
     */
    getPeginAmountAt(htlc_vout: number): bigint;
    /**
     * Returns the transaction ID.
     */
    getTxid(): string;
    /**
     * Creates a new unfunded Pre-PegIn transaction.
     *
     * Internally computes `depositor_claim_value` (via `compute_min_claim_value`)
     * and `htlc_value` (= `pegin_amount + depositor_claim_value + min_pegin_fee`)
     * from the provided contract parameters.
     *
     * # Arguments
     *
     * * `depositor` - Hex-encoded depositor public key (64 chars)
     * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
     * * `vault_keepers` - Array of hex-encoded vault keeper public keys
     * * `universal_challengers` - Array of hex-encoded universal challenger public keys
     * * `hashlocks` - Array of hex-encoded SHA256 hash commitments (64 hex chars each).
     *   One per HTLC output. For a single deposit pass one hashlock; for batched
     *   deposits pass multiple.
     * * `pegin_amounts` - Array of pegin amounts in satoshis (one per hashlock).
     *   Must have the same length as `hashlocks`.
     * * `timelock_refund` - CSV timelock for the refund path (must be non-zero)
     * * `fee_rate` - Fee rate in sat/vB (from contract offchain params)
     * * `num_local_challengers` - Number of local challengers (from contract params)
     * * `council_quorum` - M in M-of-N council multisig (from contract params)
     * * `council_size` - N in M-of-N council multisig (from contract params)
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     */
    constructor(depositor: string, vault_provider: string, vault_keepers: string[], universal_challengers: string[], hashlocks: string[], pegin_amounts: BigUint64Array, timelock_refund: number, fee_rate: bigint, num_local_challengers: number, council_quorum: number, council_size: number, network: string);
    /**
     * Returns the transaction as hex-encoded bytes.
     */
    toHex(): string;
}

/**
 * Computes sighashes for the claimer's Assert transaction inputs.
 *
 * Returns a JSON array of hex-encoded sighashes (one per input).
 *
 * # Arguments
 *
 * * `graph_json` - JSON-serialized `TxGraph`
 */
export function computeAssertClaimerSighashes(graph_json: string): string;

/**
 * Computes sighashes for the claimer's ChallengeAssert transactions (X and Y)
 * for a specific challenger.
 *
 * Returns a JSON array of two hex-encoded sighashes: [ca_x_sighash, ca_y_sighash].
 *
 * # Arguments
 *
 * * `graph_json` - JSON-serialized `TxGraph`
 * * `challenger_pk_hex` - Hex-encoded challenger x-only public key (64 chars)
 */
export function computeChallengeAssertClaimerSighashes(graph_json: string, challenger_pk_hex: string): string;

/**
 * Computes the minimum depositor claim value (in satoshis) needed to fund the
 * entire claim transaction path.
 *
 * This is the single value the frontend needs to validate a PegIn's second output.
 * It accounts for both fee-rate-dependent costs (transaction vbytes × fee_rate)
 * and fixed structural costs (dust/minimum-value outputs along the path).
 *
 * The WOTS label count (`PI_1_BITS = 508`) is a protocol constant and does not
 * need to be specified.
 *
 * Usage in JS:
 * ```js
 * const minClaimValue = computeMinClaimValue(numLocal, numUniversal, quorum, councilSize, feeRate);
 * ```
 *
 * # Arguments
 *
 * * `num_local_challengers` - Number of local challengers
 * * `num_universal_challengers` - Number of universal challengers
 * * `council_quorum` - M in M-of-N council multisig
 * * `council_size` - N in M-of-N council multisig
 * * `fee_rate` - Fee rate in sat/vB from the contract
 */
export function computeMinClaimValue(num_local_challengers: number, num_universal_challengers: number, council_quorum: number, council_size: number, fee_rate: bigint): bigint;

/**
 * Computes the sighash for the claimer's NoPayout transaction for a specific
 * challenger.
 *
 * Returns a hex-encoded sighash.
 *
 * # Arguments
 *
 * * `graph_json` - JSON-serialized `TxGraph`
 * * `challenger_pk_hex` - Hex-encoded challenger x-only public key (64 chars)
 */
export function computeNoPayoutClaimerSighash(graph_json: string, challenger_pk_hex: string): string;

/**
 * Computes the sighash for the claimer's Payout transaction (input 1, Assert
 * connector).
 *
 * Returns a hex-encoded sighash.
 *
 * # Arguments
 *
 * * `graph_json` - JSON-serialized `TxGraph`
 */
export function computePayoutClaimerSighash(graph_json: string): string;

/**
 * Computes the sighash for the depositor's Payout transaction (input 0, vault
 * UTXO).
 *
 * Returns a hex-encoded sighash.
 *
 * # Arguments
 *
 * * `graph_json` - JSON-serialized `TxGraph`
 */
export function computePayoutDepositorSighash(graph_json: string): string;

/**
 * Computes the sighash for a PegIn transaction input (HTLC leaf 0 spend).
 *
 * Returns a hex-encoded sighash.
 *
 * # Arguments
 *
 * * `pegin_json` - JSON-serialized `PegInTx`
 * * `htlc_connector_json` - JSON-serialized `PrePeginHtlcConnector`
 * * `prepegin_htlc_output_json` - JSON-serialized `TxOut` (the Pre-PegIn HTLC output)
 */
export function computePeginInputSighash(pegin_json: string, htlc_connector_json: string, prepegin_htlc_output_json: string): string;

/**
 * Derive the on-chain vault identifier matching the Solidity logic:
 *
 * ```solidity
 * keccak256(abi.encode(peginTxHash, depositor))
 * ```
 *
 * This duplicates the ABI encoding from [`eth_client::vault_id::VaultId::derive`]
 * because the `vault` crate cannot depend on `eth-client` (which pulls in `alloy`)
 * in WASM builds. Both implementations must produce identical output — see the
 * cross-crate golden-vector test in `eth-client` tests.
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
 * Initialize panic hook for better error messages in the browser console.
 */
export function init_panic_hook(): void;

/**
 * Validates TxGraph parameters before construction.
 *
 * Checks that the claimer is VP, one of VKs, or the depositor; that no key
 * overlaps exist between roles; and that GC data is present for every
 * challenger.
 *
 * # Arguments
 *
 * * `params_json` - JSON-serialized `TxGraphParams`
 *
 * # Returns
 *
 * `Ok(())` if all parameters are valid, otherwise a descriptive error string.
 */
export function validateTxGraphParams(params_json: string): void;

/**
 * Verifies claimer presignatures for the depositor-as-claimer flow.
 *
 * Validates the claimer's signatures on ChallengeAssert and NoPayout
 * transactions for every challenger in the graph.
 *
 * # Arguments
 *
 * * `graph_json` - JSON-serialized `TxGraph`
 * * `claimer_pk_hex` - Hex-encoded claimer x-only public key (64 chars)
 * * `presigs_json` - JSON-serialized `ChallengePathPresignatures`
 */
export function verifyClaimerPresignatures(graph_json: string, claimer_pk_hex: string, presigs_json: string): void;

/**
 * Verifies the depositor's signature on the Payout transaction.
 *
 * # Arguments
 *
 * * `graph_json` - JSON-serialized `TxGraph`
 * * `depositor_pk_hex` - Hex-encoded depositor x-only public key (64 chars)
 * * `payout_sig_hex` - Hex-encoded Schnorr signature (128 chars)
 */
export function verifyDepositorSignature(graph_json: string, depositor_pk_hex: string, payout_sig_hex: string): void;

/**
 * Verifies a Taproot script-path signature.
 *
 * # Arguments
 *
 * * `tx_hex` - Hex-encoded consensus-serialized Bitcoin transaction
 * * `input_index` - Index of the input being verified
 * * `prevouts_json` - JSON-serialized array of `TxOut`
 * * `script_hex` - Hex-encoded script being used for the spend
 * * `pubkey_hex` - Hex-encoded x-only public key (64 chars)
 * * `signature_hex` - Hex-encoded Taproot signature (64 or 65 bytes)
 */
export function verifyP2trScriptSpendSignature(tx_hex: string, input_index: number, prevouts_json: string, script_hex: string, pubkey_hex: string, signature_hex: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmassertchallengeassertconnector_free: (a: number, b: number) => void;
    readonly __wbg_wasmassertpayoutnopayoutconnector_free: (a: number, b: number) => void;
    readonly __wbg_wasmpayouttx_free: (a: number, b: number) => void;
    readonly __wbg_wasmpeginpayoutconnector_free: (a: number, b: number) => void;
    readonly __wbg_wasmpegintx_free: (a: number, b: number) => void;
    readonly __wbg_wasmprepeginhtlcconnector_free: (a: number, b: number) => void;
    readonly __wbg_wasmprepegintx_free: (a: number, b: number) => void;
    readonly computeAssertClaimerSighashes: (a: number, b: number) => [number, number, number, number];
    readonly computeChallengeAssertClaimerSighashes: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly computeMinClaimValue: (a: number, b: number, c: number, d: number, e: bigint) => [bigint, number, number];
    readonly computeNoPayoutClaimerSighash: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly computePayoutClaimerSighash: (a: number, b: number) => [number, number, number, number];
    readonly computePayoutDepositorSighash: (a: number, b: number) => [number, number, number, number];
    readonly computePeginInputSighash: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly deriveVaultId: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly validateTxGraphParams: (a: number, b: number) => [number, number];
    readonly verifyClaimerPresignatures: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly verifyDepositorSignature: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly verifyP2trScriptSpendSignature: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number];
    readonly wasmassertchallengeassertconnector_getAddress: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmassertchallengeassertconnector_getControlBlock: (a: number) => [number, number, number, number];
    readonly wasmassertchallengeassertconnector_getScript: (a: number) => [number, number, number, number];
    readonly wasmassertchallengeassertconnector_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly wasmassertpayoutnopayoutconnector_getAddress: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmassertpayoutnopayoutconnector_getNoPayoutControlBlock: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmassertpayoutnopayoutconnector_getNoPayoutScript: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmassertpayoutnopayoutconnector_getPayoutControlBlock: (a: number) => [number, number, number, number];
    readonly wasmassertpayoutnopayoutconnector_getPayoutScript: (a: number) => [number, number];
    readonly wasmassertpayoutnopayoutconnector_getScriptPubKey: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmassertpayoutnopayoutconnector_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly wasmpayouttx_estimateVsize: (a: number, b: number, c: number, d: number, e: number, f: number) => [bigint, number, number];
    readonly wasmpayouttx_fromJson: (a: number, b: number) => [number, number, number];
    readonly wasmpayouttx_getTxid: (a: number) => [number, number];
    readonly wasmpayouttx_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: number, j: number, k: number) => [number, number, number];
    readonly wasmpayouttx_toHex: (a: number) => [number, number];
    readonly wasmpayouttx_toJson: (a: number) => [number, number, number, number];
    readonly wasmpeginpayoutconnector_getAddress: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmpeginpayoutconnector_getPayoutControlBlock: (a: number) => [number, number, number, number];
    readonly wasmpeginpayoutconnector_getPayoutScript: (a: number) => [number, number];
    readonly wasmpeginpayoutconnector_getScriptPubKey: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmpeginpayoutconnector_getTaprootScriptHash: (a: number) => [number, number];
    readonly wasmpeginpayoutconnector_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly wasmpegintx_fromJson: (a: number, b: number) => [number, number, number];
    readonly wasmpegintx_getTxid: (a: number) => [number, number];
    readonly wasmpegintx_getVaultScriptPubKey: (a: number) => [number, number];
    readonly wasmpegintx_getVaultValue: (a: number) => bigint;
    readonly wasmpegintx_toHex: (a: number) => [number, number];
    readonly wasmpegintx_toJson: (a: number) => [number, number, number, number];
    readonly wasmprepeginhtlcconnector_getAddress: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmprepeginhtlcconnector_getHashlockControlBlock: (a: number) => [number, number, number, number];
    readonly wasmprepeginhtlcconnector_getHashlockScript: (a: number) => [number, number];
    readonly wasmprepeginhtlcconnector_getRefundControlBlock: (a: number) => [number, number, number, number];
    readonly wasmprepeginhtlcconnector_getRefundScript: (a: number) => [number, number];
    readonly wasmprepeginhtlcconnector_getScriptPubKey: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmprepeginhtlcconnector_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
    readonly wasmprepegintx_buildPeginTx: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmprepegintx_buildRefundTx: (a: number, b: bigint, c: number) => [number, number, number, number];
    readonly wasmprepegintx_fromFundedTransaction: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmprepegintx_getDepositorClaimValue: (a: number) => bigint;
    readonly wasmprepegintx_getHtlcAddress: (a: number, b: number) => [number, number, number, number];
    readonly wasmprepegintx_getHtlcScriptPubKey: (a: number, b: number) => [number, number, number, number];
    readonly wasmprepegintx_getHtlcValue: (a: number, b: number) => [bigint, number, number];
    readonly wasmprepegintx_getNumHtlcs: (a: number) => number;
    readonly wasmprepegintx_getPeginAmountAt: (a: number, b: number) => [bigint, number, number];
    readonly wasmprepegintx_getTxid: (a: number) => [number, number];
    readonly wasmprepegintx_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: bigint, o: number, p: number, q: number, r: number, s: number) => [number, number, number];
    readonly wasmprepegintx_toHex: (a: number) => [number, number];
    readonly init_panic_hook: () => void;
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
