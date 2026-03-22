let wasm;

let WASM_VECTOR_LEN = 0;

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
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
    }
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

function isLikeNone(x) {
    return x === undefined || x === null;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
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
/**
 * Returns the number of UTXOs used per challenger to distribute input label hashes.
 *
 * This is a protocol constant (currently 3) derived from Bitcoin's 1000 stack element
 * limit. With 508 bits × 5 elements per bit = 2540 total elements, at least 3 UTXOs
 * are needed to stay under the limit.
 *
 * The frontend can use this to compute the number of Assert outputs per challenger
 * instead of maintaining a hardcoded value.
 * @returns {number}
 */
export function numUtxosForInputLabels() {
    const ret = wasm.numUtxosForInputLabels();
    return ret >>> 0;
}

/**
 * Computes the minimum depositor claim value (in satoshis) needed to fund the
 * entire claim transaction path.
 *
 * This is the single value the frontend needs to validate a PegIn's second output.
 * It accounts for both fee-rate-dependent costs (transaction vbytes × fee_rate)
 * and fixed structural costs (dust/minimum-value outputs along the path).
 *
 * The Lamport label count (`PI_1_BITS = 508`) is a protocol constant and does not
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
export function computeMinClaimValue(num_local_challengers, num_universal_challengers, council_quorum, council_size, fee_rate) {
    const ret = wasm.computeMinClaimValue(num_local_challengers, num_universal_challengers, council_quorum, council_size, fee_rate);
    return BigInt.asUintN(64, ret);
}

/**
 * Initialize panic hook for better error messages in the browser console.
 */
export function init_panic_hook() {
    wasm.init_panic_hook();
}

const WasmAssertChallengeAssertConnectorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmassertchallengeassertconnector_free(ptr >>> 0, 1));
/**
 * WASM wrapper for AssertChallengeAssertConnector.
 *
 * This connector defines the spending conditions for Assert outputs 1..3(N+M),
 * used by ChallengeAssert transactions to prove invalid assertions.
 */
export class WasmAssertChallengeAssertConnector {

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
     * Returns the ChallengeAssert script as hex.
     * @returns {string}
     */
    getScript() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmassertchallengeassertconnector_getScript(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
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
     * Creates a new AssertChallengeAssertConnector.
     *
     * # Arguments
     *
     * * `claimer` - Hex-encoded claimer public key (64 chars)
     * * `challenger` - Hex-encoded challenger public key (64 chars)
     * * `lamport_hashes_json` - JSON string of the Lamport label hashes for this segment
     * * `gc_input_label_hashes_json` - JSON string of the GC input label hashes (array, one per GC)
     * @param {string} claimer
     * @param {string} challenger
     * @param {string} lamport_hashes_json
     * @param {string} gc_input_label_hashes_json
     */
    constructor(claimer, challenger, lamport_hashes_json, gc_input_label_hashes_json) {
        const ptr0 = passStringToWasm0(claimer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(challenger, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(lamport_hashes_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(gc_input_label_hashes_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
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

const WasmAssertPayoutNoPayoutConnectorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmassertpayoutnopayoutconnector_free(ptr >>> 0, 1));
/**
 * WASM wrapper for AssertPayoutNoPayoutCouncilNoPayoutConnector.
 *
 * This connector defines the spending conditions for Assert output 0,
 * supporting Payout, NoPayout (per challenger), and CouncilNoPayout paths.
 */
export class WasmAssertPayoutNoPayoutConnector {

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

const WasmPayoutTxFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpayouttx_free(ptr >>> 0, 1));
/**
 * WASM wrapper for PayoutTx.
 *
 * Represents a Payout transaction that releases funds after a successful
 * challenge resolution (Assert path).
 */
export class WasmPayoutTx {

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
}
if (Symbol.dispose) WasmPayoutTx.prototype[Symbol.dispose] = WasmPayoutTx.prototype.free;

const WasmPeginPayoutConnectorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpeginpayoutconnector_free(ptr >>> 0, 1));
/**
 * WASM wrapper for PeginPayoutConnector.
 *
 * This connector defines the spending conditions for the PegIn output.
 */
export class WasmPeginPayoutConnector {

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

const WasmPeginTxFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpegintx_free(ptr >>> 0, 1));
/**
 * WASM wrapper for PegInTx.
 *
 * Represents an unfunded PegIn transaction that locks funds into the vault.
 */
export class WasmPeginTx {

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
     * Returns the vault output value in satoshis.
     * @returns {bigint}
     */
    getVaultValue() {
        const ret = wasm.wasmpegintx_getVaultValue(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
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
}
if (Symbol.dispose) WasmPeginTx.prototype[Symbol.dispose] = WasmPeginTx.prototype.free;

const WasmPrePeginHtlcConnectorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmprepeginhtlcconnector_free(ptr >>> 0, 1));
/**
 * WASM wrapper for PrePeginHtlcConnector.
 *
 * This connector defines the spending conditions for the Pre-PegIn HTLC output.
 * The frontend uses `getHashlockScript()` and `getHashlockControlBlock()` to
 * build a PSBT for the depositor's signature over the PegIn input.
 */
export class WasmPrePeginHtlcConnector {

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
     * Creates a new PrePeginHtlcConnector.
     *
     * # Arguments
     *
     * * `depositor` - Hex-encoded depositor public key (64 chars)
     * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
     * * `vault_keepers` - Array of hex-encoded vault keeper public keys
     * * `universal_challengers` - Array of hex-encoded universal challenger public keys
     * * `hash_h` - Hex-encoded SHA256 hash commitment (64 hex chars = 32 bytes)
     * * `timelock_refund` - CSV timelock for the refund path (must be non-zero)
     * @param {string} depositor
     * @param {string} vault_provider
     * @param {string[]} vault_keepers
     * @param {string[]} universal_challengers
     * @param {string} hash_h
     * @param {number} timelock_refund
     */
    constructor(depositor, vault_provider, vault_keepers, universal_challengers, hash_h, timelock_refund) {
        const ptr0 = passStringToWasm0(depositor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(vault_provider, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayJsValueToWasm0(vault_keepers, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayJsValueToWasm0(universal_challengers, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(hash_h, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
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

const WasmPrePeginTxFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmprepegintx_free(ptr >>> 0, 1));
/**
 * WASM wrapper for PrePegInTx.
 *
 * Represents an unfunded Pre-PegIn transaction that locks BTC in an HTLC output.
 * Also serves as the entry point for deriving the PegIn and refund transactions.
 */
export class WasmPrePeginTx {

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
     * Builds the PegIn transaction that spends this Pre-PegIn's HTLC output.
     *
     * The resulting transaction has a single input spending Pre-PegIn output 0
     * via the hashlock + all-party script (leaf 0). The fee is baked into the
     * HTLC input/output difference.
     *
     * Since Pre-PegIn inputs are required to be non-legacy (SegWit/Taproot),
     * the txid is stable after funding — signing does not change it.
     *
     * # Arguments
     *
     * * `timelock_pegin` - CSV timelock (P = t3) in blocks for the PegIn output
     * * `funded_prepegin_txid` - Hex-encoded txid of the funded Pre-PegIn transaction
     * @param {number} timelock_pegin
     * @param {string} funded_prepegin_txid
     * @returns {WasmPeginTx}
     */
    buildPeginTx(timelock_pegin, funded_prepegin_txid) {
        const ptr0 = passStringToWasm0(funded_prepegin_txid, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmprepegintx_buildPeginTx(this.__wbg_ptr, timelock_pegin, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmPeginTx.__wrap(ret[0]);
    }
    /**
     * Returns the HTLC output value in satoshis.
     * @returns {bigint}
     */
    getHtlcValue() {
        const ret = wasm.wasmprepegintx_getHtlcValue(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Builds an unsigned refund transaction that spends this Pre-PegIn's HTLC
     * output via the refund script (leaf 1) after the timelock expires.
     *
     * The depositor signs this externally via their wallet.
     *
     * # Arguments
     *
     * * `refund_fee` - Transaction fee in satoshis
     * * `funded_prepegin_txid` - Hex-encoded txid of the funded Pre-PegIn transaction
     * @param {bigint} refund_fee
     * @param {string} funded_prepegin_txid
     * @returns {string}
     */
    buildRefundTx(refund_fee, funded_prepegin_txid) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(funded_prepegin_txid, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmprepegintx_buildRefundTx(this.__wbg_ptr, refund_fee, ptr0, len0);
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
     * Returns the HTLC Taproot address.
     * @returns {string}
     */
    getHtlcAddress() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmprepegintx_getHtlcAddress(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Returns the pegin amount in satoshis.
     * @returns {bigint}
     */
    getPeginAmount() {
        const ret = wasm.wasmprepegintx_getPeginAmount(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Returns the HTLC output scriptPubKey as hex.
     * @returns {string}
     */
    getHtlcScriptPubKey() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmprepegintx_getHtlcScriptPubKey(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
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
     * * `hash_h` - Hex-encoded SHA256 hash commitment (64 hex chars = 32 bytes)
     * * `timelock_refund` - CSV timelock for the refund path (must be non-zero)
     * * `pegin_amount` - Amount in satoshis to lock in the vault
     * * `fee_rate` - Fee rate in sat/vB (from contract offchain params)
     * * `num_local_challengers` - Number of local challengers (from contract params)
     * * `council_quorum` - M in M-of-N council multisig (from contract params)
     * * `council_size` - N in M-of-N council multisig (from contract params)
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * @param {string} depositor
     * @param {string} vault_provider
     * @param {string[]} vault_keepers
     * @param {string[]} universal_challengers
     * @param {string} hash_h
     * @param {number} timelock_refund
     * @param {bigint} pegin_amount
     * @param {bigint} fee_rate
     * @param {number} num_local_challengers
     * @param {number} council_quorum
     * @param {number} council_size
     * @param {string} network
     */
    constructor(depositor, vault_provider, vault_keepers, universal_challengers, hash_h, timelock_refund, pegin_amount, fee_rate, num_local_challengers, council_quorum, council_size, network) {
        const ptr0 = passStringToWasm0(depositor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(vault_provider, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayJsValueToWasm0(vault_keepers, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayJsValueToWasm0(universal_challengers, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(hash_h, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len5 = WASM_VECTOR_LEN;
        const ret = wasm.wasmprepegintx_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, timelock_refund, pegin_amount, fee_rate, num_local_challengers, council_quorum, council_size, ptr5, len5);
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
}
if (Symbol.dispose) WasmPrePeginTx.prototype[Symbol.dispose] = WasmPrePeginTx.prototype.free;

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg___wbindgen_string_get_e4f06c90489ad01b = function(arg0, arg1) {
        const obj = arg1;
        const ret = typeof(obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg___wbindgen_throw_b855445ff6a94295 = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
        }
    };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
        const ret = new Error();
        return ret;
    };
    imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
        const ret = arg1.stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
        // Cast intrinsic for `Ref(String) -> Externref`.
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('btc_vault_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
