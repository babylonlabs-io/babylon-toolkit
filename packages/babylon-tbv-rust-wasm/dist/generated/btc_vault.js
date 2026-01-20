let wasm;

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
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

function isLikeNone(x) {
    return x === undefined || x === null;
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

let WASM_VECTOR_LEN = 0;

const WasmPayoutOptimisticTxFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpayoutoptimistictx_free(ptr >>> 0, 1));

const WasmPayoutTxFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpayouttx_free(ptr >>> 0, 1));

const WasmPeginPayoutConnectorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpeginpayoutconnector_free(ptr >>> 0, 1));

const WasmPeginTxFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpegintx_free(ptr >>> 0, 1));

/**
 * WASM wrapper for PayoutOptimisticTx.
 *
 * Represents a PayoutOptimistic transaction that releases funds when no
 * challenge is posted (optimistic path).
 */
export class WasmPayoutOptimisticTx {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmPayoutOptimisticTx.prototype);
        obj.__wbg_ptr = ptr;
        WasmPayoutOptimisticTxFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPayoutOptimisticTxFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpayoutoptimistictx_free(ptr, 0);
    }
    /**
     * Estimates the virtual size of a PayoutOptimistic transaction.
     *
     * # Arguments
     *
     * * `num_vault_keepers` - Number of vault keepers
     * * `num_universal_challengers` - Number of universal challengers
     * * `num_local_challengers` - Number of local challengers
     * @param {number} num_vault_keepers
     * @param {number} num_universal_challengers
     * @param {number} num_local_challengers
     * @returns {bigint}
     */
    static estimateVsize(num_vault_keepers, num_universal_challengers, num_local_challengers) {
        const ret = wasm.wasmpayoutoptimistictx_estimateVsize(num_vault_keepers, num_universal_challengers, num_local_challengers);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Creates a new PayoutOptimistic transaction.
     *
     * # Arguments
     *
     * * `pegin_tx_json` - JSON string of the PegInTx
     * * `claim_tx_json` - JSON string of the ClaimTx
     * * `timelock_challenge` - Challenge period timelock (t3)
     * * `payout_receiver` - Hex-encoded public key of the payout receiver
     * * `fee` - Transaction fee in satoshis
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * @param {string} pegin_tx_json
     * @param {string} claim_tx_json
     * @param {number} timelock_challenge
     * @param {string} payout_receiver
     * @param {bigint} fee
     * @param {string} network
     */
    constructor(pegin_tx_json, claim_tx_json, timelock_challenge, payout_receiver, fee, network) {
        const ptr0 = passStringToWasm0(pegin_tx_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(claim_tx_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(payout_receiver, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpayoutoptimistictx_new(ptr0, len0, ptr1, len1, timelock_challenge, ptr2, len2, fee, ptr3, len3);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmPayoutOptimisticTxFinalization.register(this, this.__wbg_ptr, this);
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
            const ret = wasm.wasmpayoutoptimistictx_toHex(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Returns the serialized PayoutOptimisticTx as JSON.
     * @returns {string}
     */
    toJson() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmpayoutoptimistictx_toJson(this.__wbg_ptr);
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
            const ret = wasm.wasmpayoutoptimistictx_getTxid(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Creates a WasmPayoutOptimisticTx from a JSON string.
     * @param {string} json
     * @returns {WasmPayoutOptimisticTx}
     */
    static fromJson(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpayoutoptimistictx_fromJson(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmPayoutOptimisticTx.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmPayoutOptimisticTx.prototype[Symbol.dispose] = WasmPayoutOptimisticTx.prototype.free;

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
     * @param {number} num_vault_keepers
     * @param {number} num_universal_challengers
     * @param {number} num_local_challengers
     * @param {number} council_size
     * @returns {bigint}
     */
    static estimateVsize(num_vault_keepers, num_universal_challengers, num_local_challengers, council_size) {
        const ret = wasm.wasmpayouttx_estimateVsize(num_vault_keepers, num_universal_challengers, num_local_challengers, council_size);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Creates a new Payout transaction.
     *
     * # Arguments
     *
     * * `pegin_tx_json` - JSON string of the PegInTx
     * * `assert_tx_json` - JSON string of the AssertTx
     * * `payout_receiver` - Hex-encoded public key of the payout receiver
     * * `fee` - Transaction fee in satoshis
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * @param {string} pegin_tx_json
     * @param {string} assert_tx_json
     * @param {string} payout_receiver
     * @param {bigint} fee
     * @param {string} network
     */
    constructor(pegin_tx_json, assert_tx_json, payout_receiver, fee, network) {
        const ptr0 = passStringToWasm0(pegin_tx_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(assert_tx_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(payout_receiver, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpayouttx_new(ptr0, len0, ptr1, len1, ptr2, len2, fee, ptr3, len3);
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
     * Creates a new PeginPayoutConnector.
     *
     * # Arguments
     *
     * * `depositor` - Hex-encoded depositor public key (64 chars)
     * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
     * * `vault_keepers` - Array of hex-encoded vault keeper public keys
     * * `universal_challengers` - Array of hex-encoded universal challenger public keys
     * @param {string} depositor
     * @param {string} vault_provider
     * @param {string[]} vault_keepers
     * @param {string[]} universal_challengers
     */
    constructor(depositor, vault_provider, vault_keepers, universal_challengers) {
        const ptr0 = passStringToWasm0(depositor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(vault_provider, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayJsValueToWasm0(vault_keepers, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayJsValueToWasm0(universal_challengers, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpeginpayoutconnector_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmPeginPayoutConnectorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) WasmPeginPayoutConnector.prototype[Symbol.dispose] = WasmPeginPayoutConnector.prototype.free;

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
     * Creates a new unfunded PegIn transaction.
     *
     * # Arguments
     *
     * * `depositor` - Hex-encoded depositor public key (64 chars)
     * * `vault_provider` - Hex-encoded vault provider public key (64 chars)
     * * `vault_keepers` - Array of hex-encoded vault keeper public keys
     * * `universal_challengers` - Array of hex-encoded universal challenger public keys
     * * `pegin_amount` - Amount in satoshis to lock in the vault
     * * `network` - Network name: "mainnet", "testnet", "regtest", or "signet"
     * @param {string} depositor
     * @param {string} vault_provider
     * @param {string[]} vault_keepers
     * @param {string[]} universal_challengers
     * @param {bigint} pegin_amount
     * @param {string} network
     */
    constructor(depositor, vault_provider, vault_keepers, universal_challengers, pegin_amount, network) {
        const ptr0 = passStringToWasm0(depositor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(vault_provider, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayJsValueToWasm0(vault_keepers, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayJsValueToWasm0(universal_challengers, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpegintx_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, pegin_amount, ptr4, len4);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmPeginTxFinalization.register(this, this.__wbg_ptr, this);
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

/**
 * Initialize panic hook for better error messages in the browser console.
 */
export function init_panic_hook() {
    wasm.init_panic_hook();
}

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
    imports.wbg.__wbg___wbindgen_string_get_a2a31e16edf96e42 = function(arg0, arg1) {
        const obj = arg1;
        const ret = typeof(obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
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
