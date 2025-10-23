/**
 * BTC Payout Transaction Signing Service
 *
 * Handles signing payout transactions for the peg-in flow using Taproot script path spend.
 * Constructs PSBTs with complete Taproot spend information required by BTC wallets.
 */

import { Psbt, Transaction, payments, initEccLib, crypto as bcrypto } from 'bitcoinjs-lib';
import * as ecc from '@bitcoin-js/tiny-secp256k1-asmjs';
import * as varuint from 'varuint-bitcoin';
import {
  createPayoutConnector,
  tapInternalPubkey,
  type Network,
} from '../../utils/btc';

// Initialize ECC library for Taproot operations
// This must be called before using payments.p2tr() or other Taproot features
initEccLib(ecc);

/**
 * Serializes a script with Bitcoin varint length prefix.
 * This matches bitcoinjs-lib's internal serializeScript function used in tapleafHash.
 *
 * @param script The script buffer to serialize
 * @returns Buffer containing varint(length) || script
 */
function serializeScript(script: Buffer): Buffer {
  const varintLen = varuint.encodingLength(script.length);
  const buffer = Buffer.allocUnsafe(varintLen);
  varuint.encode(script.length, buffer);
  return Buffer.concat([buffer, script]);
}

export interface PayoutTransactionInput {
  /**
   * Transaction hash (reversed txid for bitcoinjs-lib)
   */
  hash: Buffer;

  /**
   * Output index being spent
   */
  index: number;

  /**
   * Sequence number
   */
  sequence: number;

  /**
   * Witness UTXO (required for Taproot)
   */
  witnessUtxo: {
    script: Buffer;
    value: number;
  };
}

export interface SignPayoutTransactionParams {
  /**
   * Payout transaction hex from vault provider (payout_tx.tx_hex)
   */
  payoutTxHex: string;

  /**
   * Pegin transaction hex (needed for prevout values/scripts)
   */
  peginTxHex: string;

  /**
   * Claim transaction hex (needed for prevout values/scripts)
   */
  claimTxHex: string;

  /**
   * Depositor's BTC public key (x-only, 32 bytes hex, no 0x prefix)
   */
  depositorBtcPubkey: string;

  /**
   * Vault provider's BTC public key (x-only, 32 bytes hex, no 0x prefix)
   */
  vaultProviderBtcPubkey: string;

  /**
   * Liquidator BTC public keys (x-only, 32 bytes hex, no 0x prefix)
   */
  liquidatorBtcPubkeys: string[];

  /**
   * BTC network
   */
  network: Network;

  /**
   * BTC wallet provider with signing capability
   */
  btcWalletProvider: {
    signPsbt: (psbtHex: string) => Promise<string>;
  };
}

/**
 * Sign a payout transaction using Taproot script path spend
 *
 * This function:
 * 1. Parses the payout, pegin, and claim transactions
 * 2. Creates a PayoutConnector using WASM to get the tapLeafScript
 * 3. Constructs a PSBT with complete Taproot spend information
 * 4. Signs the PSBT using the user's BTC wallet
 * 5. Extracts the 64-byte Schnorr signature
 *
 * @param params - Transaction and signing parameters
 * @returns 64-byte Schnorr signature (128 hex characters, no sighash flag)
 * @throws Error if signing fails or signature cannot be extracted
 */
export async function signPayoutTransaction(
  params: SignPayoutTransactionParams,
): Promise<string> {
  const {
    payoutTxHex,
    peginTxHex,
    claimTxHex,
    depositorBtcPubkey,
    vaultProviderBtcPubkey,
    liquidatorBtcPubkeys,
    network,
    btcWalletProvider,
  } = params;

  // Version check for debugging browser cache issues
  console.log('[PSBT-DEBUG] ========== FILE VERSION CHECK ==========');
  console.log('[PSBT-DEBUG] vaultPayoutSigningService.ts loaded at:', new Date().toISOString());
  console.log('[PSBT-DEBUG] SIGHASH_DEFAULT version (should see this message in new code)');
  console.log('[PSBT-DEBUG] tapMerkleRoot field removed (should NOT be in addInput)');

  // Remove 0x prefix if present
  const cleanPayoutHex = payoutTxHex.startsWith('0x')
    ? payoutTxHex.slice(2)
    : payoutTxHex;
  const cleanPeginHex = peginTxHex.startsWith('0x')
    ? peginTxHex.slice(2)
    : peginTxHex;
  const cleanClaimHex = claimTxHex.startsWith('0x')
    ? claimTxHex.slice(2)
    : claimTxHex;

  // Log transaction hexes for Rust debug test
  console.log('[DEBUG-TX] Pegin hex:', cleanPeginHex);
  console.log('[DEBUG-TX] Claim hex:', cleanClaimHex);
  console.log('[DEBUG-TX] Payout hex:', cleanPayoutHex);

  try {
    // Step 1: Parse transactions to extract prevout information
    const payoutTx = Transaction.fromHex(cleanPayoutHex);
    const peginTx = Transaction.fromHex(cleanPeginHex);
    const claimTx = Transaction.fromHex(cleanClaimHex);


    // Step 2: Create payout connector to get taproot script information
    const payoutConnector = await createPayoutConnector(
      {
        depositor: depositorBtcPubkey,
        vaultProvider: vaultProviderBtcPubkey,
        liquidators: liquidatorBtcPubkeys,
      },
      network,
    );

    // Log liquidator order used for payout connector
    console.log('\n[DEBUG] Liquidators used for payout connector:');
    console.log(`  Order: [${liquidatorBtcPubkeys.map(pk => pk.substring(0, 16) + '...').join(', ')}]`);
    const isSorted = JSON.stringify(liquidatorBtcPubkeys) === JSON.stringify([...liquidatorBtcPubkeys].sort());
    console.log(`  Sorted check: liquidators ${isSorted ? 'ARE' : 'ARE NOT'} in sorted order`);

    // Step 3: Compute control block for script path spend
    // The control block proves that the script is part of the taproot tree
    const payoutScriptBuffer = Buffer.from(payoutConnector.payoutScript, 'hex');
    const controlBlock = computeControlBlock(
      tapInternalPubkey,
      payoutScriptBuffer,
    );

    // Step 4: Build PSBT with Taproot spend information
    // First, compute tapMerkleRoot for enhanced PSBT
    const leafVersionByte = Buffer.from([0xc0]); // Taproot leaf version
    const serializedScript = serializeScript(payoutScriptBuffer);
    const leafPreimage = Buffer.concat([leafVersionByte, serializedScript]);
    const leafHash = bcrypto.taggedHash('TapLeaf', leafPreimage);
    // For a single-leaf tree, the merkle root is the leaf hash itself
    const tapMerkleRoot = leafHash;

    console.log('\n[PSBT-DEBUG] ========== PSBT CONSTRUCTION ==========');
    console.log('[PSBT-DEBUG] tapInternalKey:', tapInternalPubkey.toString('hex'));
    console.log('[PSBT-DEBUG] tapMerkleRoot:', tapMerkleRoot.toString('hex'));
    console.log('[PSBT-DEBUG] tapLeafHash:', leafHash.toString('hex'));
    console.log('[PSBT-DEBUG] payoutScript length:', payoutScriptBuffer.length, 'bytes');
    console.log('[PSBT-DEBUG] controlBlock length:', controlBlock.length, 'bytes');

    const psbt = new Psbt();
    psbt.setVersion(payoutTx.version);
    psbt.setLocktime(payoutTx.locktime);

    // Add inputs with complete Taproot spend information
    // The payout transaction typically has 3 inputs:
    // - Input 0: Pegin transaction output 0 (vault output)
    // - Input 1: Claim transaction output 0
    // - Input 2: Claim transaction output 1
    for (let i = 0; i < payoutTx.ins.length; i++) {
      const input = payoutTx.ins[i];

      // Determine which transaction this input spends from
      let prevTx: Transaction;
      let prevIndex: number;

      // Check if this input spends from pegin tx
      const inputTxid = Buffer.from(input.hash).reverse().toString('hex');
      const peginTxid = peginTx.getId();

      if (inputTxid === peginTxid) {
        prevTx = peginTx;
        prevIndex = input.index;
      } else {
        // Must be from claim tx
        prevTx = claimTx;
        prevIndex = input.index;
      }

      const prevOut = prevTx.outs[prevIndex];
      if (!prevOut) {
        throw new Error(`Previous output not found for input ${i}`);
      }

      // IMPORTANT: Only input 0 (pegin output) is signed by depositor using script path spend
      // Inputs 1 and 2 (claim outputs) are signed by claimer separately
      if (i === 0) {
        // Input 0: Add Taproot script path spend information for depositor signature
        console.log('\n[PSBT-DEBUG] ========== ADDING INPUT 0 ==========');
        console.log('[PSBT-DEBUG] Current PSBT inputs count:', psbt.data.inputs.length);
        console.log('[PSBT-DEBUG] Input data being added:');
        console.log('[PSBT-DEBUG]   hash:', input.hash.toString('hex'));
        console.log('[PSBT-DEBUG]   index:', input.index);
        console.log('[PSBT-DEBUG]   sequence:', input.sequence);
        console.log('[PSBT-DEBUG]   witnessUtxo.value:', prevOut.value);
        console.log('[PSBT-DEBUG]   witnessUtxo.script:', prevOut.script.toString('hex'));
        console.log('[PSBT-DEBUG]   tapLeafScript.length:', 1);
        console.log('[PSBT-DEBUG]   tapLeafScript[0].leafVersion:', '0xc0');
        console.log('[PSBT-DEBUG]   tapLeafScript[0].script.length:', payoutScriptBuffer.length);
        console.log('[PSBT-DEBUG]   tapLeafScript[0].controlBlock.length:', controlBlock.length);
        console.log('[PSBT-DEBUG]   tapInternalKey:', tapInternalPubkey.toString('hex'));
        console.log('[PSBT-DEBUG]   sighashType:', 'omitted (will default to SIGHASH_DEFAULT)');
        console.log('[PSBT-DEBUG] About to call psbt.addInput()...');

        const inputData = {
          hash: input.hash,
          index: input.index,
          sequence: input.sequence,
          witnessUtxo: {
            script: prevOut.script,
            value: prevOut.value,
          },
          // Taproot script path spend fields for payout script
          tapLeafScript: [
            {
              leafVersion: 0xc0, // Taproot leaf version
              script: payoutScriptBuffer,
              controlBlock: controlBlock,
            },
          ],
          tapInternalKey: tapInternalPubkey,
          // sighashType omitted - bitcoinjs-lib defaults to SIGHASH_DEFAULT (0x00) for Taproot
        };

        console.log('[PSBT-DEBUG] Full inputData object:', JSON.stringify({
          hash: inputData.hash.toString('hex'),
          index: inputData.index,
          sequence: inputData.sequence,
          witnessUtxo: {
            script: inputData.witnessUtxo.script.toString('hex'),
            value: inputData.witnessUtxo.value,
          },
          tapLeafScript: inputData.tapLeafScript.map(leaf => ({
            leafVersion: leaf.leafVersion,
            scriptLength: leaf.script.length,
            controlBlockLength: leaf.controlBlock.length,
          })),
          tapInternalKey: inputData.tapInternalKey.toString('hex'),
          sighashType: 'omitted (bitcoinjs-lib will default to SIGHASH_DEFAULT)',
        }, null, 2));

        try {
          console.log('[PSBT-DEBUG] BEFORE addInput - psbt.data.inputs.length:', psbt.data.inputs.length);
          console.log('[PSBT-DEBUG] BEFORE addInput - psbt.data.inputs:', JSON.stringify(psbt.data.inputs, null, 2));

          psbt.addInput(inputData);

          console.log('[PSBT-DEBUG] ✅ Successfully added input 0');
          console.log('[PSBT-DEBUG] AFTER addInput - psbt.data.inputs.length:', psbt.data.inputs.length);
          const addedInput = psbt.data.inputs[0];
          console.log('[PSBT-DEBUG] AFTER addInput - input 0 fields:', Object.keys(addedInput));
          if (addedInput.tapMerkleRoot) {
            console.log('[PSBT-DEBUG] ⚠️  tap MerkleRoot WAS ADDED:', addedInput.tapMerkleRoot.toString('hex'));
          } else {
            console.log('[PSBT-DEBUG] ✓ tapMerkleRoot NOT present (good)');
          }
        } catch (err: any) {
          console.error('[PSBT-DEBUG] ❌ ERROR adding input 0:', err);
          console.error('[PSBT-DEBUG] Error message:', err.message);
          console.error('[PSBT-DEBUG] Error stack:', err.stack);

          // Try to see what's in the PSBT at error time
          console.error('[PSBT-DEBUG] PSBT state at error:');
          console.error('[PSBT-DEBUG]   inputs.length:', psbt.data.inputs.length);
          if (psbt.data.inputs.length > 0) {
            const input0 = psbt.data.inputs[0];
            console.error('[PSBT-DEBUG]   input[0] keys:', Object.keys(input0));
            if (input0.tapMerkleRoot) {
              console.error('[PSBT-DEBUG]   input[0].tapMerkleRoot:', input0.tapMerkleRoot.toString('hex'));
            }
          }

          throw err;
        }
      } else {
        // Inputs 1 and 2: Basic witness UTXO only (signed by claimer, not depositor)
        psbt.addInput({
          hash: input.hash,
          index: input.index,
          sequence: input.sequence,
          witnessUtxo: {
            script: prevOut.script,
            value: prevOut.value,
          },
        });
      }
    }

    // Add outputs
    for (const output of payoutTx.outs) {
      psbt.addOutput({
        script: output.script,
        value: output.value,
      });
    }

    const psbtHex = psbt.toHex();

    // === COMPREHENSIVE PSBT DEBUG ===
    console.log('\n[PSBT-DEBUG] ========== PSBT DETAILS BEFORE SIGNING ==========');
    console.log('[PSBT-DEBUG] PSBT version:', psbt.version);
    console.log('[PSBT-DEBUG] PSBT locktime:', psbt.locktime);
    console.log('[PSBT-DEBUG] Number of inputs:', psbt.data.inputs.length);
    console.log('[PSBT-DEBUG] Number of outputs:', psbt.data.outputs.length);

    // Log detailed info for input 0 (the one being signed)
    console.log('\n[PSBT-DEBUG] Input 0 (depositor signature required):');
    const input0 = psbt.data.inputs[0];
    console.log('[PSBT-DEBUG]   witnessUtxo:', input0.witnessUtxo ? {
      value: input0.witnessUtxo.value,
      scriptPubKey: input0.witnessUtxo.script.toString('hex')
    } : 'MISSING');
    console.log('[PSBT-DEBUG]   tapInternalKey:', input0.tapInternalKey?.toString('hex') || 'MISSING');
    console.log('[PSBT-DEBUG]   tapMerkleRoot:', input0.tapMerkleRoot?.toString('hex') || 'MISSING');
    console.log('[PSBT-DEBUG]   sighashType:', input0.sighashType !== undefined ? `0x${input0.sighashType.toString(16).padStart(2, '0')}` : 'undefined');
    console.log('[PSBT-DEBUG]   tapLeafScript count:', input0.tapLeafScript?.length || 0);
    if (input0.tapLeafScript && input0.tapLeafScript.length > 0) {
      input0.tapLeafScript.forEach((leaf, i) => {
        console.log(`[PSBT-DEBUG]     leaf[${i}]:`, {
          leafVersion: `0x${leaf.leafVersion.toString(16)}`,
          scriptLength: leaf.script.length,
          controlBlockLength: leaf.controlBlock.length,
        });
      });
    }

    // Log wallet provider info
    console.log('\n[PSBT-DEBUG] Wallet Provider:', btcWalletProvider.constructor.name);
    console.log('[PSBT-DEBUG] PSBT hex length:', psbtHex.length, 'chars');

    // === DETAILED SIGHASH DEBUG ===
    console.log('\n[SIGHASH-DEBUG] BIP 341 Sighash Components:');

    // Log sha_prevouts components
    console.log('\n[SIGHASH-DEBUG] sha_prevouts (all input prevouts):');
    payoutTx.ins.forEach((input, i) => {
      const inputTxid = Buffer.from(input.hash).reverse().toString('hex');
      console.log(`  input[${i}]: ${inputTxid}:${input.index}`);
    });

    // Log sha_amounts components
    console.log('\n[SIGHASH-DEBUG] sha_amounts (all prevout values):');
    for (let i = 0; i < payoutTx.ins.length; i++) {
      const psbtInput = psbt.data.inputs[i];
      if (psbtInput.witnessUtxo) {
        console.log(`  input[${i}]: ${psbtInput.witnessUtxo.value} sats`);
      } else {
        console.log(`  input[${i}]: MISSING witnessUtxo!`);
      }
    }

    // Log sha_scriptpubkeys components
    console.log('\n[SIGHASH-DEBUG] sha_scriptpubkeys (all prevout scripts):');
    for (let i = 0; i < payoutTx.ins.length; i++) {
      const psbtInput = psbt.data.inputs[i];
      if (psbtInput.witnessUtxo) {
        console.log(`  input[${i}]: ${psbtInput.witnessUtxo.script.toString('hex')}`);
      } else {
        console.log(`  input[${i}]: MISSING witnessUtxo!`);
      }
    }

    // Log sha_sequences components
    console.log('\n[SIGHASH-DEBUG] sha_sequences (all input sequences):');
    payoutTx.ins.forEach((input, i) => {
      console.log(`  input[${i}]: ${input.sequence}`);
    });

    // Log sha_outputs components
    console.log('\n[SIGHASH-DEBUG] sha_outputs (all outputs):');
    payoutTx.outs.forEach((output, i) => {
      console.log(`  output[${i}]: ${output.value} sats, script: ${output.script.toString('hex')}`);
    });

    // Log input being signed
    console.log('\n[SIGHASH-DEBUG] Input being signed:');
    console.log(`  input_index: 0`);
    console.log(`  TapLeafHash: ${payoutConnector.taprootScriptHash}`);
    console.log(`  Payout script: ${payoutConnector.payoutScript}`);
    console.log(`  Sighash type: SIGHASH_DEFAULT (0x00)`);

    // === COMPUTE ACTUAL SIGHASH THAT WILL BE SIGNED ===
    // Extract the actual sighash that bitcoinjs-lib computes for input 0
    try {
      const inputIndex = 0;
      const input = psbt.data.inputs[inputIndex];

      if (!input.witnessUtxo) {
        throw new Error('Missing witnessUtxo for input 0');
      }

      if (!input.tapLeafScript || input.tapLeafScript.length === 0) {
        throw new Error('Missing tapLeafScript for input 0');
      }

      // Get the tap leaf script info
      const tapLeafScript = input.tapLeafScript[0];
      const leafVersion = tapLeafScript.leafVersion;
      const leafScript = tapLeafScript.script;

      // Compute TapLeafHash using EXACT same method as bitcoinjs-lib
      // This matches bitcoinjs-lib's tapleafHash() function in payments/bip341.js
      const leafVersionByte = Buffer.from([leafVersion]);
      const serializedScript = serializeScript(leafScript); // varint(length) || script
      const leafPreimage = Buffer.concat([leafVersionByte, serializedScript]);
      const leafHash = bcrypto.taggedHash('TapLeaf', leafPreimage);
      console.log(`\n[SIGHASH-DEBUG] Computed TapLeafHash from PSBT: ${leafHash.toString('hex')}`);
      console.log(`[SIGHASH-DEBUG] Script size: ${leafScript.length} bytes, serialized: ${serializedScript.slice(0, 10).toString('hex')}...`);

      // Compute BIP 341 sighash using bitcoinjs-lib's internal method
      // This is the EXACT sighash that the wallet will sign
      const prevoutScripts = psbt.data.inputs.map(input => input.witnessUtxo!.script);
      const prevoutValues = psbt.data.inputs.map(input => input.witnessUtxo!.value);

      // Use bitcoinjs-lib's hashForWitnessV1 to compute the sighash
      // Use SIGHASH_DEFAULT (0x00) to match wallet behavior
      const sighashType = input.sighashType !== undefined ? input.sighashType : 0x00; // SIGHASH_DEFAULT
      const hash = payoutTx.hashForWitnessV1(
        inputIndex,
        prevoutScripts,
        prevoutValues,
        sighashType,
        leafHash
      );

      console.log(`\n[SIGHASH-DEBUG] ⚠️  COMPUTED SIGHASH (what we expect wallet to sign): ${hash.toString('hex')}`);
      console.log(`[SIGHASH-DEBUG] Using SIGHASH_DEFAULT (0x00) - matches wallet behavior`);
      console.log(`[SIGHASH-DEBUG] This is the message the wallet should sign with Schnorr signature\n`);

    } catch (error) {
      console.error('[SIGHASH-DEBUG] Failed to compute sighash:', error);
    }

    // Step 5: Sign PSBT with user's BTC wallet
    const signedPsbtHex = await btcWalletProvider.signPsbt(psbtHex);
    const signedPsbt = Psbt.fromHex(signedPsbtHex);

    console.log('\n[WALLET-DEBUG] ========== WALLET SIGNING RESULT ==========');

    // Step 6: Extract the Schnorr signature from the first input
    if (signedPsbt.data.inputs.length === 0) {
      throw new Error('No inputs found in signed PSBT');
    }

    const firstInput = signedPsbt.data.inputs[0];

    // Store computed sighash and signature for verification
    let computedSighash: Buffer | null = null;
    let extractedSignature: Buffer | null = null;

    // Re-compute sighash for verification
    try {
      const inputIndex = 0;
      const input = psbt.data.inputs[inputIndex];
      if (input.witnessUtxo && input.tapLeafScript && input.tapLeafScript.length > 0) {
        const tapLeafScript = input.tapLeafScript[0];
        const leafVersionByte = Buffer.from([tapLeafScript.leafVersion]);
        const serializedScript = serializeScript(tapLeafScript.script); // varint(length) || script
        const leafPreimage = Buffer.concat([leafVersionByte, serializedScript]);
        const leafHash = bcrypto.taggedHash('TapLeaf', leafPreimage);

        const prevoutScripts = psbt.data.inputs.map(input => input.witnessUtxo!.script);
        const prevoutValues = psbt.data.inputs.map(input => input.witnessUtxo!.value);
        const sighashType = input.sighashType !== undefined ? input.sighashType : 0x00; // SIGHASH_DEFAULT
        computedSighash = payoutTx.hashForWitnessV1(inputIndex, prevoutScripts, prevoutValues, sighashType, leafHash);
      }
    } catch (e) {
      console.error('[WALLET-DEBUG] Failed to re-compute sighash for verification:', e);
    }

    // Method 1: Try to extract from tapScriptSig (preferred for non-finalized PSBT)
    if (firstInput.tapScriptSig && firstInput.tapScriptSig.length > 0) {
      const depositorPubkeyBuffer = Buffer.from(depositorBtcPubkey, 'hex');

      console.log(`[WALLET-DEBUG] Found ${firstInput.tapScriptSig.length} tapScriptSig entries`);

      for (const sigEntry of firstInput.tapScriptSig) {
        console.log(`[WALLET-DEBUG] Signature entry for pubkey: ${sigEntry.pubkey.toString('hex')}`);
        console.log(`[WALLET-DEBUG] Signature length: ${sigEntry.signature.length} bytes`);

        if (sigEntry.pubkey.equals(depositorPubkeyBuffer)) {
          const signature = sigEntry.signature;
          console.log(`[WALLET-DEBUG] ✓ Found depositor signature in tapScriptSig`);
          console.log(`[WALLET-DEBUG] Raw signature (with potential sighash byte): ${signature.toString('hex')}`);

          // Handle sighash flag byte
          let sig64: Buffer;
          if (signature.length === 64) {
            sig64 = signature;
            console.log(`[WALLET-DEBUG] Signature is 64 bytes (no sighash flag)`);
          } else if (signature.length === 65) {
            const sighashFlag = signature[64];
            console.log(`[WALLET-DEBUG] Signature is 65 bytes, sighash flag: 0x${sighashFlag.toString(16)}`);
            // Remove sighash flag byte
            sig64 = signature.subarray(0, 64);
          } else {
            throw new Error(`Unexpected Schnorr signature length: ${signature.length}`);
          }

          extractedSignature = sig64;
          console.log(`[WALLET-DEBUG] Final 64-byte signature: ${sig64.toString('hex')}`);

          // Verify signature against computed sighash
          if (computedSighash && extractedSignature) {
            try {
              const pubkeyBytes = Buffer.from(depositorBtcPubkey, 'hex');
              const isValid = ecc.verifySchnorr(computedSighash, pubkeyBytes, extractedSignature);

              console.log(`\n[WALLET-DEBUG] ===== SIGNATURE VERIFICATION =====`);
              console.log(`[WALLET-DEBUG] Sighash used:     ${computedSighash.toString('hex')}`);
              console.log(`[WALLET-DEBUG] Signature:        ${extractedSignature.toString('hex')}`);
              console.log(`[WALLET-DEBUG] Depositor pubkey: ${depositorBtcPubkey}`);
              console.log(`[WALLET-DEBUG] Verification result: ${isValid ? '✓ VALID' : '✗ INVALID'}`);
              console.log(`[WALLET-DEBUG] =================================\n`);

              if (!isValid) {
                console.error('[WALLET-DEBUG] ⚠️  CRITICAL: Wallet signature does NOT verify against computed sighash!');
                console.error('[WALLET-DEBUG] This means the wallet signed a DIFFERENT message than we computed.');

                // === DIAGNOSTIC: Test if wallet used KEY PATH spend instead of SCRIPT PATH ===
                console.log('\n[WALLET-DEBUG] ===== TESTING ALTERNATIVE SIGHASH =====');
                console.log('[WALLET-DEBUG] Hypothesis: Wallet might be using KEY PATH spend (ignoring tapLeafScript)');

                try {
                  // Compute sighash for KEY PATH spend (without tapLeafHash)
                  const prevoutScripts = psbt.data.inputs.map(input => input.witnessUtxo!.script);
                  const prevoutValues = psbt.data.inputs.map(input => input.witnessUtxo!.value);
                  const keyPathSighash = payoutTx.hashForWitnessV1(
                    0,
                    prevoutScripts,
                    prevoutValues,
                    Transaction.SIGHASH_ALL
                    // NO leafHash = key path spend
                  );

                  console.log(`[WALLET-DEBUG] Key path sighash: ${keyPathSighash.toString('hex')}`);

                  // Test if signature verifies against key path sighash
                  const keyPathValid = ecc.verifySchnorr(keyPathSighash, pubkeyBytes, extractedSignature);
                  console.log(`[WALLET-DEBUG] Signature valid for KEY PATH: ${keyPathValid ? '✓ YES' : '✗ NO'}`);
                  console.log(`[WALLET-DEBUG] ========================================\n`);

                  if (keyPathValid) {
                    console.error('[WALLET-DEBUG] 🚨 ROOT CAUSE FOUND:');
                    console.error('[WALLET-DEBUG] Wallet is using KEY PATH spend, ignoring tapLeafScript!');
                    console.error('[WALLET-DEBUG] This means the wallet does not support script path spend via PSBT.');
                    console.error('[WALLET-DEBUG] SOLUTION: Need to use direct message signing instead of PSBT signing.');
                  }
                } catch (keyPathError) {
                  console.error('[WALLET-DEBUG] Failed to test key path hypothesis:', keyPathError);
                }
              }
            } catch (verifyError) {
              console.error('[WALLET-DEBUG] Failed to verify signature:', verifyError);
            }
          }

          return sig64.toString('hex');
        }
      }
    }

    // Method 2: Try to extract from finalized transaction witness (for finalized PSBT)
    console.log('[WALLET-DEBUG] No tapScriptSig found, trying to extract from finalized witness...');
    try {
      const tx = signedPsbt.extractTransaction();
      const witness = tx.ins[0].witness;

      if (!witness || witness.length === 0) {
        throw new Error('No witness data in signed transaction');
      }

      console.log(`[WALLET-DEBUG] Witness has ${witness.length} elements`);

      // For Taproot script path spend, witness format is:
      // [sig1] [sig2] ... [sigN] [script] [control_block]
      // The first item should be the depositor's signature
      const depositorSig = witness[0];
      console.log(`[WALLET-DEBUG] First witness element (depositor sig) length: ${depositorSig.length} bytes`);

      // Handle sighash flag byte
      let sig64: Buffer;
      if (depositorSig.length === 64) {
        sig64 = depositorSig;
        console.log(`[WALLET-DEBUG] Signature is 64 bytes (no sighash flag)`);
      } else if (depositorSig.length === 65) {
        const sighashFlag = depositorSig[64];
        console.log(`[WALLET-DEBUG] Signature is 65 bytes, sighash flag: 0x${sighashFlag.toString(16)}`);

        sig64 = depositorSig.subarray(0, 64);

        // For SIGHASH_ALL (0x01) or SIGHASH_DEFAULT (0x00), remove the flag
        if (sighashFlag !== 0x01 && sighashFlag !== 0x00) {
          throw new Error(`Unexpected sighash flag: 0x${sighashFlag.toString(16)}`);
        }
      } else {
        throw new Error(`Unexpected signature length: ${depositorSig.length}`);
      }

      extractedSignature = sig64;
      console.log(`[WALLET-DEBUG] Final 64-byte signature: ${sig64.toString('hex')}`);

      // Verify signature against computed sighash
      if (computedSighash && extractedSignature) {
        try {
          const pubkeyBytes = Buffer.from(depositorBtcPubkey, 'hex');
          const isValid = ecc.verifySchnorr(computedSighash, pubkeyBytes, extractedSignature);

          console.log(`\n[WALLET-DEBUG] ===== SIGNATURE VERIFICATION =====`);
          console.log(`[WALLET-DEBUG] Sighash used:     ${computedSighash.toString('hex')}`);
          console.log(`[WALLET-DEBUG] Signature:        ${extractedSignature.toString('hex')}`);
          console.log(`[WALLET-DEBUG] Depositor pubkey: ${depositorBtcPubkey}`);
          console.log(`[WALLET-DEBUG] Verification result: ${isValid ? '✓ VALID' : '✗ INVALID'}`);
          console.log(`[WALLET-DEBUG] =================================\n`);

          if (!isValid) {
            console.error('[WALLET-DEBUG] ⚠️  CRITICAL: Wallet signature does NOT verify against computed sighash!');
            console.error('[WALLET-DEBUG] This means the wallet signed a DIFFERENT message than we computed.');

            // === DIAGNOSTIC: Test if wallet used KEY PATH spend instead of SCRIPT PATH ===
            console.log('\n[WALLET-DEBUG] ===== TESTING ALTERNATIVE SIGHASH =====');
            console.log('[WALLET-DEBUG] Hypothesis: Wallet might be using KEY PATH spend (ignoring tapLeafScript)');

            try {
              // Compute sighash for KEY PATH spend (without tapLeafHash)
              const prevoutScripts = psbt.data.inputs.map(input => input.witnessUtxo!.script);
              const prevoutValues = psbt.data.inputs.map(input => input.witnessUtxo!.value);
              const keyPathSighash = payoutTx.hashForWitnessV1(
                0,
                prevoutScripts,
                prevoutValues,
                Transaction.SIGHASH_ALL
                // NO leafHash = key path spend
              );

              console.log(`[WALLET-DEBUG] Key path sighash: ${keyPathSighash.toString('hex')}`);

              // Test if signature verifies against key path sighash
              const keyPathValid = ecc.verifySchnorr(keyPathSighash, pubkeyBytes, extractedSignature);
              console.log(`[WALLET-DEBUG] Signature valid for KEY PATH: ${keyPathValid ? '✓ YES' : '✗ NO'}`);
              console.log(`[WALLET-DEBUG] ========================================\n`);

              if (keyPathValid) {
                console.error('[WALLET-DEBUG] 🚨 ROOT CAUSE FOUND:');
                console.error('[WALLET-DEBUG] Wallet is using KEY PATH spend, ignoring tapLeafScript!');
                console.error('[WALLET-DEBUG] This means the wallet does not support script path spend via PSBT.');
                console.error('[WALLET-DEBUG] SOLUTION: Need to use direct message signing instead of PSBT signing.');
                return sig64.toString('hex'); // Early return if we found the issue
              }

              // === TEST 2: SIGHASH_DEFAULT (0x00) instead of SIGHASH_ALL (0x01) ===
              console.log('\n[WALLET-DEBUG] ===== TEST 2: SIGHASH_DEFAULT =====');
              console.log('[WALLET-DEBUG] Testing if wallet uses SIGHASH_DEFAULT (0x00) instead of SIGHASH_ALL (0x01)');

              const input = psbt.data.inputs[0];
              if (input.tapLeafScript && input.tapLeafScript.length > 0) {
                const tapLeafScript = input.tapLeafScript[0];
                const leafVersionByte = Buffer.from([tapLeafScript.leafVersion]);
                const serializedScript = serializeScript(tapLeafScript.script);
                const leafPreimage = Buffer.concat([leafVersionByte, serializedScript]);
                const leafHash = bcrypto.taggedHash('TapLeaf', leafPreimage);

                // Compute sighash with SIGHASH_DEFAULT (0x00)
                const sighashDefault = payoutTx.hashForWitnessV1(
                  0,
                  prevoutScripts,
                  prevoutValues,
                  0x00,  // SIGHASH_DEFAULT
                  leafHash
                );

                console.log(`[WALLET-DEBUG] SIGHASH_DEFAULT sighash: ${sighashDefault.toString('hex')}`);

                const defaultValid = ecc.verifySchnorr(sighashDefault, pubkeyBytes, extractedSignature);
                console.log(`[WALLET-DEBUG] Signature valid for SIGHASH_DEFAULT: ${defaultValid ? '✓ YES' : '✗ NO'}`);
                console.log(`[WALLET-DEBUG] ========================================\n`);

                if (defaultValid) {
                  console.error('[WALLET-DEBUG] 🚨 ROOT CAUSE FOUND:');
                  console.error('[WALLET-DEBUG] Wallet is using SIGHASH_DEFAULT (0x00) but signature has 0x01 flag!');
                  console.error('[WALLET-DEBUG] SOLUTION: Need to handle SIGHASH_DEFAULT in verification.');
                  return sig64.toString('hex');
                }
              }

              // === TEST 3: Tweaked Public Key ===
              console.log('\n[WALLET-DEBUG] ===== TEST 3: TWEAKED PUBLIC KEY =====');
              console.log('[WALLET-DEBUG] Testing if wallet uses tweaked pubkey for signing');

              try {
                // Compute tap tweak
                const tapTweak = bcrypto.taggedHash('TapTweak', tapInternalPubkey);
                console.log(`[WALLET-DEBUG] Tap tweak: ${tapTweak.toString('hex')}`);

                // Add tweak to depositor pubkey
                const tweakResult = ecc.xOnlyPointAddTweak(pubkeyBytes, tapTweak);

                if (tweakResult && tweakResult.xOnlyPubkey) {
                  const tweakedPubkey = Buffer.from(tweakResult.xOnlyPubkey);
                  console.log(`[WALLET-DEBUG] Tweaked pubkey: ${tweakedPubkey.toString('hex')}`);

                  // Test script path sighash with tweaked pubkey
                  const tweakedValid = ecc.verifySchnorr(computedSighash, tweakedPubkey, extractedSignature);
                  console.log(`[WALLET-DEBUG] Signature valid with TWEAKED pubkey: ${tweakedValid ? '✓ YES' : '✗ NO'}`);
                  console.log(`[WALLET-DEBUG] ========================================\n`);

                  if (tweakedValid) {
                    console.error('[WALLET-DEBUG] 🚨 ROOT CAUSE FOUND:');
                    console.error('[WALLET-DEBUG] Wallet is signing with TWEAKED pubkey instead of raw depositor pubkey!');
                    console.error('[WALLET-DEBUG] SOLUTION: Need to use tweaked pubkey for verification.');
                    return sig64.toString('hex');
                  }
                } else {
                  console.error('[WALLET-DEBUG] Failed to compute tweaked pubkey');
                }
              } catch (tweakError) {
                console.error('[WALLET-DEBUG] Tweak test error:', tweakError);
              }

              // === FINAL MESSAGE ===
              console.log('\n[WALLET-DEBUG] ========================================');
              console.error('[WALLET-DEBUG] ⚠️  NO KNOWN SIGHASH MATCHES!');
              console.error('[WALLET-DEBUG] Wallet is computing sighash in an unknown/non-standard way.');
              console.error('[WALLET-DEBUG] Tested:');
              console.error('[WALLET-DEBUG]   - Script path (SIGHASH_ALL + leafHash): ✗');
              console.error('[WALLET-DEBUG]   - Key path (SIGHASH_ALL, no leafHash): ✗');
              console.error('[WALLET-DEBUG]   - Script path (SIGHASH_DEFAULT + leafHash): ✗');
              console.error('[WALLET-DEBUG]   - Tweaked pubkey: ✗');
              console.error('[WALLET-DEBUG]');
              console.error('[WALLET-DEBUG] NEXT STEPS:');
              console.error('[WALLET-DEBUG] 1. Check which BTC wallet provider is being used');
              console.error('[WALLET-DEBUG] 2. Check wallet documentation for Taproot PSBT support');
              console.error('[WALLET-DEBUG] 3. Consider using direct message signing instead of PSBT');
              console.log('[WALLET-DEBUG] ========================================\n');

            } catch (keyPathError) {
              console.error('[WALLET-DEBUG] Failed to test alternative sighashes:', keyPathError);
            }
          }
        } catch (verifyError) {
          console.error('[WALLET-DEBUG] Failed to verify signature:', verifyError);
        }
      }

      return sig64.toString('hex');
    } catch (extractError) {
      throw extractError;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('[signPayoutTransaction] Stack:', error.stack);
      throw new Error(`Failed to sign payout transaction: ${error.message}`);
    }
    throw new Error('Failed to sign payout transaction: Unknown error');
  }
}

/**
 * Compute control block for Taproot script path spend
 *
 * The control block is used to prove that a script is part of the taproot tree.
 * For a single script (no tree), it's: [leaf_version | parity] || internal_key
 *
 * @param internalKey - The taproot internal key (NUMS point)
 * @param script - The script being spent
 * @returns Control block buffer
 */
function computeControlBlock(
  internalKey: Buffer,
  script: Buffer,
): Buffer {
  // Compute the taproot output key from the internal key and script
  // For a single leaf, scriptTree should be an object, not an array
  const scriptTree = { output: script };
  const payment = payments.p2tr({
    internalPubkey: internalKey,
    scriptTree,
  });

  // Extract the control block from the payment
  // The control block format is: [version_byte] || [internal_key] || [merkle_proof]
  // For a single script (no tree), merkle_proof is empty

  // Leaf version is 0xc0 for tapscript
  const leafVersion = 0xc0;

  // Get parity bit from the output key
  // The parity bit indicates if the Y coordinate is even (0) or odd (1)
  const outputKey = payment.pubkey;
  if (!outputKey) {
    throw new Error('Failed to compute output key');
  }

  // First byte of control block: leaf_version | parity
  // bitcoinjs-lib returns full pubkey (33 bytes), last byte is parity
  const parity = outputKey[0] === 0x03 ? 1 : 0; // 0x02 = even, 0x03 = odd
  const controlByte = leafVersion | parity;

  // Control block = [control_byte] || [internal_key_x_only]
  return Buffer.concat([Buffer.from([controlByte]), internalKey]);
}
