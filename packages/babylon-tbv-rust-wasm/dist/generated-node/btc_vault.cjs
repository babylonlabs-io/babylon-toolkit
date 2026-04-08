/* @ts-self-types="./btc_vault.d.ts" */

/**
 * WASM wrapper for AssertChallengeAssertConnector.
 *
 * This connector defines the spending conditions for Assert outputs (blocks 0–1),
 * used by ChallengeAssert-A transactions to prove invalid assertions.
 */
class WasmAssertChallengeAssertConnector {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmAssertChallengeAssertConnectorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmassertchallengeassertconnector_free(ptr, 0);
    }
    /**
     * Returns the Taproot address for the connector.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * @param {string} network
     * @returns {string}
     */
    getAddress(network) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmassertchallengeassertconnector_getAddress(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Returns the control block as hex.
     * @returns {string}
     */
    getControlBlock() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmassertchallengeassertconnector_getControlBlock(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Returns the ChallengeAssert-A script as hex.
     * @returns {string}
     */
    getScript() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmassertchallengeassertconnector_getScript(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Creates a new AssertChallengeAssertConnector.
     *
     * # Arguments
     *
     * * `claimer` - Hex-encoded claimer public key (64 chars)
     * * `challenger` - Hex-encoded challenger public key (64 chars)
     * * `claimer_wots_keys_json` - JSON string of the claimer's WOTS public keys (blocks 0–1)
     * * `gc_wots_keys_json` - JSON string of the GC WOTS public keys (array of arrays, one per GC)
     * @param {string} claimer
     * @param {string} challenger
     * @param {string} claimer_wots_keys_json
     * @param {string} gc_wots_keys_json
     */
    constructor(claimer, challenger, claimer_wots_keys_json, gc_wots_keys_json) {
        const ptr0 = passStringToWasm0(claimer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(challenger, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(claimer_wots_keys_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(gc_wots_keys_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmassertchallengeassertconnector_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmAssertChallengeAssertConnectorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) WasmAssertChallengeAssertConnector.prototype[Symbol.dispose] = WasmAssertChallengeAssertConnector.prototype.free;
exports.WasmAssertChallengeAssertConnector = WasmAssertChallengeAssertConnector;

/**
 * WASM wrapper for AssertPayoutNoPayoutCouncilNoPayoutConnector.
 *
 * This connector defines the spending conditions for Assert output 0,
 * supporting Payout, NoPayout (per challenger), and CouncilNoPayout paths.
 */
class WasmAssertPayoutNoPayoutConnector {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmAssertPayoutNoPayoutConnectorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmassertpayoutnopayoutconnector_free(ptr, 0);
    }
    /**
     * Returns the Taproot address for the connector.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * @param {string} network
     * @returns {string}
     */
    getAddress(network) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmassertpayoutnopayoutconnector_getAddress(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Returns the NoPayout control block as hex for a specific challenger.
     *
     * # Arguments
     *
     * * `challenger` - Hex-encoded challenger public key (64 chars)
     * @param {string} challenger
     * @returns {string}
     */
    getNoPayoutControlBlock(challenger) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(challenger, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmassertpayoutnopayoutconnector_getNoPayoutControlBlock(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Returns the NoPayout script as hex for a specific challenger.
     *
     * # Arguments
     *
     * * `challenger` - Hex-encoded challenger public key (64 chars)
     * @param {string} challenger
     * @returns {string}
     */
    getNoPayoutScript(challenger) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(challenger, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmassertpayoutnopayoutconnector_getNoPayoutScript(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Returns the payout control block as hex.
     * @returns {string}
     */
    getPayoutControlBlock() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmassertpayoutnopayoutconnector_getPayoutControlBlock(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Returns the payout script as hex (Leaf 0: Claimer + Challengers + Timelock).
     * @returns {string}
     */
    getPayoutScript() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmassertpayoutnopayoutconnector_getPayoutScript(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Returns the Taproot scriptPubKey as hex.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * @param {string} network
     * @returns {string}
     */
    getScriptPubKey(network) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmassertpayoutnopayoutconnector_getScriptPubKey(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
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
     * @param {string} claimer
     * @param {string[]} local_challengers
     * @param {string[]} universal_challengers
     * @param {number} timelock_assert
     * @param {string[]} council_members
     * @param {number} council_quorum
     */
    constructor(claimer, local_challengers, universal_challengers, timelock_assert, council_members, council_quorum) {
        const ptr0 = passStringToWasm0(claimer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayJsValueToWasm0(local_challengers, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayJsValueToWasm0(universal_challengers, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayJsValueToWasm0(council_members, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmassertpayoutnopayoutconnector_new(ptr0, len0, ptr1, len1, ptr2, len2, timelock_assert, ptr3, len3, council_quorum);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmAssertPayoutNoPayoutConnectorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) WasmAssertPayoutNoPayoutConnector.prototype[Symbol.dispose] = WasmAssertPayoutNoPayoutConnector.prototype.free;
exports.WasmAssertPayoutNoPayoutConnector = WasmAssertPayoutNoPayoutConnector;

/**
 * WASM wrapper for PayoutTx.
 *
 * Represents a Payout transaction that releases funds after a successful
 * challenge resolution (Assert path).
 */
class WasmPayoutTx {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmPayoutTx.prototype);
        obj.__wbg_ptr = ptr;
        WasmPayoutTxFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPayoutTxFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpayouttx_free(ptr, 0);
    }
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
     * @param {number} num_vault_keepers
     * @param {number} num_universal_challengers
     * @param {number} num_local_challengers
     * @param {number} council_size
     * @param {string | null} [commission_json]
     * @returns {bigint}
     */
    static estimateVsize(num_vault_keepers, num_universal_challengers, num_local_challengers, council_size, commission_json) {
        var ptr0 = isLikeNone(commission_json) ? 0 : passStringToWasm0(commission_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpayouttx_estimateVsize(num_vault_keepers, num_universal_challengers, num_local_challengers, council_size, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return BigInt.asUintN(64, ret[0]);
    }
    /**
     * Creates a WasmPayoutTx from a JSON string.
     * @param {string} json
     * @returns {WasmPayoutTx}
     */
    static fromJson(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpayouttx_fromJson(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmPayoutTx.__wrap(ret[0]);
    }
    /**
     * Returns the transaction ID.
     * @returns {string}
     */
    getTxid() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpayouttx_getTxid(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
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
     * @param {string} pegin_tx_json
     * @param {string} assert_tx_json
     * @param {string} payout_btc_address_hex
     * @param {bigint} fee
     * @param {string} network
     * @param {string | null} [commission_json]
     */
    constructor(pegin_tx_json, assert_tx_json, payout_btc_address_hex, fee, network, commission_json) {
        const ptr0 = passStringToWasm0(pegin_tx_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(assert_tx_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(payout_btc_address_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        var ptr4 = isLikeNone(commission_json) ? 0 : passStringToWasm0(commission_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len4 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpayouttx_new(ptr0, len0, ptr1, len1, ptr2, len2, fee, ptr3, len3, ptr4, len4);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmPayoutTxFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Returns the transaction as hex-encoded bytes.
     * @returns {string}
     */
    toHex() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpayouttx_toHex(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Returns the serialized PayoutTx as JSON.
     * @returns {string}
     */
    toJson() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmpayouttx_toJson(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}
if (Symbol.dispose) WasmPayoutTx.prototype[Symbol.dispose] = WasmPayoutTx.prototype.free;
exports.WasmPayoutTx = WasmPayoutTx;

/**
 * WASM wrapper for PeginPayoutConnector.
 *
 * This connector defines the spending conditions for the PegIn output.
 */
class WasmPeginPayoutConnector {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPeginPayoutConnectorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpeginpayoutconnector_free(ptr, 0);
    }
    /**
     * Returns the Taproot address for the connector.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * @param {string} network
     * @returns {string}
     */
    getAddress(network) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmpeginpayoutconnector_getAddress(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Returns the payout control block as hex.
     *
     * The control block is needed for taproot script-path spending of the payout leaf.
     * @returns {string}
     */
    getPayoutControlBlock() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmpeginpayoutconnector_getPayoutControlBlock(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Returns the payout script as hex.
     * @returns {string}
     */
    getPayoutScript() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpeginpayoutconnector_getPayoutScript(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Returns the Taproot scriptPubKey as hex.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * @param {string} network
     * @returns {string}
     */
    getScriptPubKey(network) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmpeginpayoutconnector_getScriptPubKey(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Returns the taproot script hash.
     * @returns {string}
     */
    getTaprootScriptHash() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpeginpayoutconnector_getTaprootScriptHash(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
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
     * @param {string} depositor
     * @param {string} vault_provider
     * @param {string[]} vault_keepers
     * @param {string[]} universal_challengers
     * @param {number} timelock_pegin
     */
    constructor(depositor, vault_provider, vault_keepers, universal_challengers, timelock_pegin) {
        const ptr0 = passStringToWasm0(depositor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(vault_provider, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayJsValueToWasm0(vault_keepers, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayJsValueToWasm0(universal_challengers, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpeginpayoutconnector_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, timelock_pegin);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmPeginPayoutConnectorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) WasmPeginPayoutConnector.prototype[Symbol.dispose] = WasmPeginPayoutConnector.prototype.free;
exports.WasmPeginPayoutConnector = WasmPeginPayoutConnector;

/**
 * WASM wrapper for PegInTx.
 *
 * Represents an unfunded PegIn transaction that locks funds into the vault.
 */
class WasmPeginTx {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmPeginTx.prototype);
        obj.__wbg_ptr = ptr;
        WasmPeginTxFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPeginTxFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpegintx_free(ptr, 0);
    }
    /**
     * Creates a WasmPeginTx from a JSON string.
     * @param {string} json
     * @returns {WasmPeginTx}
     */
    static fromJson(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpegintx_fromJson(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmPeginTx.__wrap(ret[0]);
    }
    /**
     * Returns the transaction ID.
     * @returns {string}
     */
    getTxid() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpegintx_getTxid(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Returns the vault scriptPubKey as hex.
     * @returns {string}
     */
    getVaultScriptPubKey() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpegintx_getVaultScriptPubKey(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Returns the vault output value in satoshis.
     * @returns {bigint}
     */
    getVaultValue() {
        const ret = wasm.wasmpegintx_getVaultValue(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Returns the transaction as hex-encoded bytes.
     * @returns {string}
     */
    toHex() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpegintx_toHex(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Returns the serialized PegInTx as JSON.
     * @returns {string}
     */
    toJson() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmpegintx_toJson(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}
if (Symbol.dispose) WasmPeginTx.prototype[Symbol.dispose] = WasmPeginTx.prototype.free;
exports.WasmPeginTx = WasmPeginTx;

/**
 * WASM wrapper for PrePeginHtlcConnector.
 *
 * This connector defines the spending conditions for the Pre-PegIn HTLC output.
 * The frontend uses `getHashlockScript()` and `getHashlockControlBlock()` to
 * build a PSBT for the depositor's signature over the PegIn input.
 */
class WasmPrePeginHtlcConnector {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPrePeginHtlcConnectorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmprepeginhtlcconnector_free(ptr, 0);
    }
    /**
     * Returns the Taproot address for the HTLC output.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * @param {string} network
     * @returns {string}
     */
    getAddress(network) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmprepeginhtlcconnector_getAddress(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Returns the hashlock control block as hex.
     *
     * The control block is needed for taproot script-path spending of the
     * hashlock leaf (leaf 0).
     * @returns {string}
     */
    getHashlockControlBlock() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmprepeginhtlcconnector_getHashlockControlBlock(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Returns the hashlock + all-party spend script (leaf 0) as hex.
     * @returns {string}
     */
    getHashlockScript() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmprepeginhtlcconnector_getHashlockScript(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Returns the refund control block as hex.
     *
     * The control block is needed for taproot script-path spending of the
     * refund leaf (leaf 1).
     * @returns {string}
     */
    getRefundControlBlock() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmprepeginhtlcconnector_getRefundControlBlock(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Returns the refund script (leaf 1) as hex.
     * @returns {string}
     */
    getRefundScript() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmprepeginhtlcconnector_getRefundScript(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Returns the Taproot scriptPubKey as hex.
     *
     * # Arguments
     *
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * @param {string} network
     * @returns {string}
     */
    getScriptPubKey(network) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmprepeginhtlcconnector_getScriptPubKey(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
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
     * @param {string} depositor
     * @param {string} vault_provider
     * @param {string[]} vault_keepers
     * @param {string[]} universal_challengers
     * @param {string} hashlock
     * @param {number} timelock_refund
     */
    constructor(depositor, vault_provider, vault_keepers, universal_challengers, hashlock, timelock_refund) {
        const ptr0 = passStringToWasm0(depositor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(vault_provider, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayJsValueToWasm0(vault_keepers, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayJsValueToWasm0(universal_challengers, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(hashlock, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.wasmprepeginhtlcconnector_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, timelock_refund);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmPrePeginHtlcConnectorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) WasmPrePeginHtlcConnector.prototype[Symbol.dispose] = WasmPrePeginHtlcConnector.prototype.free;
exports.WasmPrePeginHtlcConnector = WasmPrePeginHtlcConnector;

/**
 * WASM wrapper for PrePegInTx.
 *
 * Represents an unfunded Pre-PegIn transaction that locks BTC in an HTLC output.
 * Also serves as the entry point for deriving the PegIn and refund transactions.
 */
class WasmPrePeginTx {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmPrePeginTx.prototype);
        obj.__wbg_ptr = ptr;
        WasmPrePeginTxFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPrePeginTxFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmprepegintx_free(ptr, 0);
    }
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
     * @param {number} timelock_pegin
     * @param {number} htlc_vout
     * @returns {WasmPeginTx}
     */
    buildPeginTx(timelock_pegin, htlc_vout) {
        const ret = wasm.wasmprepegintx_buildPeginTx(this.__wbg_ptr, timelock_pegin, htlc_vout);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmPeginTx.__wrap(ret[0]);
    }
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
     * @param {bigint} refund_fee
     * @param {number} htlc_vout
     * @returns {string}
     */
    buildRefundTx(refund_fee, htlc_vout) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmprepegintx_buildRefundTx(this.__wbg_ptr, refund_fee, htlc_vout);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
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
     * @param {string} funded_tx_hex
     * @returns {WasmPrePeginTx}
     */
    fromFundedTransaction(funded_tx_hex) {
        const ptr0 = passStringToWasm0(funded_tx_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmprepegintx_fromFundedTransaction(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmPrePeginTx.__wrap(ret[0]);
    }
    /**
     * Returns the depositor claim value in satoshis.
     * @returns {bigint}
     */
    getDepositorClaimValue() {
        const ret = wasm.wasmprepegintx_getDepositorClaimValue(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Returns the HTLC Taproot address.
     * @param {number} htlc_vout
     * @returns {string}
     */
    getHtlcAddress(htlc_vout) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmprepegintx_getHtlcAddress(this.__wbg_ptr, htlc_vout);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Returns the HTLC output scriptPubKey as hex.
     * @param {number} htlc_vout
     * @returns {string}
     */
    getHtlcScriptPubKey(htlc_vout) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmprepegintx_getHtlcScriptPubKey(this.__wbg_ptr, htlc_vout);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Returns the HTLC output value in satoshis.
     * @param {number} htlc_vout
     * @returns {bigint}
     */
    getHtlcValue(htlc_vout) {
        const ret = wasm.wasmprepegintx_getHtlcValue(this.__wbg_ptr, htlc_vout);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return BigInt.asUintN(64, ret[0]);
    }
    /**
     * Returns the number of HTLC outputs in this Pre-PegIn transaction.
     * @returns {number}
     */
    getNumHtlcs() {
        const ret = wasm.wasmprepegintx_getNumHtlcs(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Returns the pegin amount in satoshis for a specific HTLC output.
     * @param {number} htlc_vout
     * @returns {bigint}
     */
    getPeginAmountAt(htlc_vout) {
        const ret = wasm.wasmprepegintx_getPeginAmountAt(this.__wbg_ptr, htlc_vout);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return BigInt.asUintN(64, ret[0]);
    }
    /**
     * Returns the transaction ID.
     * @returns {string}
     */
    getTxid() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmprepegintx_getTxid(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
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
     * @param {string} depositor
     * @param {string} vault_provider
     * @param {string[]} vault_keepers
     * @param {string[]} universal_challengers
     * @param {string[]} hashlocks
     * @param {BigUint64Array} pegin_amounts
     * @param {number} timelock_refund
     * @param {bigint} fee_rate
     * @param {number} num_local_challengers
     * @param {number} council_quorum
     * @param {number} council_size
     * @param {string} network
     */
    constructor(depositor, vault_provider, vault_keepers, universal_challengers, hashlocks, pegin_amounts, timelock_refund, fee_rate, num_local_challengers, council_quorum, council_size, network) {
        const ptr0 = passStringToWasm0(depositor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(vault_provider, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayJsValueToWasm0(vault_keepers, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayJsValueToWasm0(universal_challengers, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArrayJsValueToWasm0(hashlocks, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArray64ToWasm0(pegin_amounts, wasm.__wbindgen_malloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len6 = WASM_VECTOR_LEN;
        const ret = wasm.wasmprepegintx_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, timelock_refund, fee_rate, num_local_challengers, council_quorum, council_size, ptr6, len6);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmPrePeginTxFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Returns the transaction as hex-encoded bytes.
     * @returns {string}
     */
    toHex() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmprepegintx_toHex(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) WasmPrePeginTx.prototype[Symbol.dispose] = WasmPrePeginTx.prototype.free;
exports.WasmPrePeginTx = WasmPrePeginTx;

/**
 * Computes sighashes for the claimer's Assert transaction inputs.
 *
 * Returns a JSON array of hex-encoded sighashes (one per input).
 *
 * # Arguments
 *
 * * `graph_json` - JSON-serialized `TxGraph`
 * @param {string} graph_json
 * @returns {string}
 */
function computeAssertClaimerSighashes(graph_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(graph_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.computeAssertClaimerSighashes(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
exports.computeAssertClaimerSighashes = computeAssertClaimerSighashes;

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
 * @param {string} graph_json
 * @param {string} challenger_pk_hex
 * @returns {string}
 */
function computeChallengeAssertClaimerSighashes(graph_json, challenger_pk_hex) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(graph_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(challenger_pk_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.computeChallengeAssertClaimerSighashes(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}
exports.computeChallengeAssertClaimerSighashes = computeChallengeAssertClaimerSighashes;

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
 * @param {number} num_local_challengers
 * @param {number} num_universal_challengers
 * @param {number} council_quorum
 * @param {number} council_size
 * @param {bigint} fee_rate
 * @returns {bigint}
 */
function computeMinClaimValue(num_local_challengers, num_universal_challengers, council_quorum, council_size, fee_rate) {
    const ret = wasm.computeMinClaimValue(num_local_challengers, num_universal_challengers, council_quorum, council_size, fee_rate);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return BigInt.asUintN(64, ret[0]);
}
exports.computeMinClaimValue = computeMinClaimValue;

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
 * @param {string} graph_json
 * @param {string} challenger_pk_hex
 * @returns {string}
 */
function computeNoPayoutClaimerSighash(graph_json, challenger_pk_hex) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(graph_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(challenger_pk_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.computeNoPayoutClaimerSighash(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}
exports.computeNoPayoutClaimerSighash = computeNoPayoutClaimerSighash;

/**
 * Computes the sighash for the claimer's Payout transaction (input 1, Assert
 * connector).
 *
 * Returns a hex-encoded sighash.
 *
 * # Arguments
 *
 * * `graph_json` - JSON-serialized `TxGraph`
 * @param {string} graph_json
 * @returns {string}
 */
function computePayoutClaimerSighash(graph_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(graph_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.computePayoutClaimerSighash(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
exports.computePayoutClaimerSighash = computePayoutClaimerSighash;

/**
 * Computes the sighash for the depositor's Payout transaction (input 0, vault
 * UTXO).
 *
 * Returns a hex-encoded sighash.
 *
 * # Arguments
 *
 * * `graph_json` - JSON-serialized `TxGraph`
 * @param {string} graph_json
 * @returns {string}
 */
function computePayoutDepositorSighash(graph_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(graph_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.computePayoutDepositorSighash(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
exports.computePayoutDepositorSighash = computePayoutDepositorSighash;

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
 * @param {string} pegin_json
 * @param {string} htlc_connector_json
 * @param {string} prepegin_htlc_output_json
 * @returns {string}
 */
function computePeginInputSighash(pegin_json, htlc_connector_json, prepegin_htlc_output_json) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(pegin_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(htlc_connector_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(prepegin_htlc_output_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.computePeginInputSighash(ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}
exports.computePeginInputSighash = computePeginInputSighash;

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
 * @param {Uint8Array} pegin_tx_hash
 * @param {Uint8Array} depositor
 * @returns {string}
 */
function deriveVaultId(pegin_tx_hash, depositor) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passArray8ToWasm0(pegin_tx_hash, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(depositor, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.deriveVaultId(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}
exports.deriveVaultId = deriveVaultId;

/**
 * Initialize panic hook for better error messages in the browser console.
 */
function init_panic_hook() {
    wasm.init_panic_hook();
}
exports.init_panic_hook = init_panic_hook;

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
 * @param {string} params_json
 */
function validateTxGraphParams(params_json) {
    const ptr0 = passStringToWasm0(params_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.validateTxGraphParams(ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}
exports.validateTxGraphParams = validateTxGraphParams;

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
 * @param {string} graph_json
 * @param {string} claimer_pk_hex
 * @param {string} presigs_json
 */
function verifyClaimerPresignatures(graph_json, claimer_pk_hex, presigs_json) {
    const ptr0 = passStringToWasm0(graph_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(claimer_pk_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(presigs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.verifyClaimerPresignatures(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}
exports.verifyClaimerPresignatures = verifyClaimerPresignatures;

/**
 * Verifies the depositor's signature on the Payout transaction.
 *
 * # Arguments
 *
 * * `graph_json` - JSON-serialized `TxGraph`
 * * `depositor_pk_hex` - Hex-encoded depositor x-only public key (64 chars)
 * * `payout_sig_hex` - Hex-encoded Schnorr signature (128 chars)
 * @param {string} graph_json
 * @param {string} depositor_pk_hex
 * @param {string} payout_sig_hex
 */
function verifyDepositorSignature(graph_json, depositor_pk_hex, payout_sig_hex) {
    const ptr0 = passStringToWasm0(graph_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(depositor_pk_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(payout_sig_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.verifyDepositorSignature(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}
exports.verifyDepositorSignature = verifyDepositorSignature;

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
 * @param {string} tx_hex
 * @param {number} input_index
 * @param {string} prevouts_json
 * @param {string} script_hex
 * @param {string} pubkey_hex
 * @param {string} signature_hex
 */
function verifyP2trScriptSpendSignature(tx_hex, input_index, prevouts_json, script_hex, pubkey_hex, signature_hex) {
    const ptr0 = passStringToWasm0(tx_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(prevouts_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(script_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(pubkey_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passStringToWasm0(signature_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len4 = WASM_VECTOR_LEN;
    const ret = wasm.verifyP2trScriptSpendSignature(ptr0, len0, input_index, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}
exports.verifyP2trScriptSpendSignature = verifyP2trScriptSpendSignature;

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_debug_string_5398f5bb970e0daa: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_function_3c846841762788c1: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_781bc9f159099513: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_7ef6b97b02428fae: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_52709e72fb9f179c: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_string_get_395e606bd0ee4427: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_2d781c1f4d5c0ef8: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_length_ea16607d7b61445b: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_with_length_825018a1616e9e55: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_d62e5099504357e6: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_8adb955bd33fac2f: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_f207c857566db248: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_bb9f1ba69d61b386: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_a068d24e39478a8a: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./btc_vault_bg.js": import0,
    };
}

const WasmAssertChallengeAssertConnectorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmassertchallengeassertconnector_free(ptr >>> 0, 1));
const WasmAssertPayoutNoPayoutConnectorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmassertpayoutnopayoutconnector_free(ptr >>> 0, 1));
const WasmPayoutTxFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpayouttx_free(ptr >>> 0, 1));
const WasmPeginPayoutConnectorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpeginpayoutconnector_free(ptr >>> 0, 1));
const WasmPeginTxFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpegintx_free(ptr >>> 0, 1));
const WasmPrePeginHtlcConnectorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmprepeginhtlcconnector_free(ptr >>> 0, 1));
const WasmPrePeginTxFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmprepegintx_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedBigUint64ArrayMemory0 = null;
function getBigUint64ArrayMemory0() {
    if (cachedBigUint64ArrayMemory0 === null || cachedBigUint64ArrayMemory0.byteLength === 0) {
        cachedBigUint64ArrayMemory0 = new BigUint64Array(wasm.memory.buffer);
    }
    return cachedBigUint64ArrayMemory0;
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getBigUint64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    for (let i = 0; i < array.length; i++) {
        const add = addToExternrefTable0(array[i]);
        getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

const wasmPath = `${__dirname}/btc_vault_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
let wasm = new WebAssembly.Instance(wasmModule, __wbg_get_imports()).exports;
wasm.__wbindgen_start();
