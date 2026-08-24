/**
 * BIP-322 official P2WPKH "simple" test vectors, pinned from
 * `bitcoin/bips` `bip-0322/basic-test-vectors.json` at commit
 * d77863fb9e9be7829ad8bb51694b9ba80a786766 ("BIP-0322: update test
 * vectors", 2026-05-06). The base64 `bip322_signatures` entries (after
 * stripping the file's `smp` variant marker) decode to consensus
 * witnesses `[DER sig ‖ 0x01, 33-byte compressed pubkey]`; the fields
 * below are those decoded bytes as hex.
 *
 * Signer: private key L3VFeEujGtevx9w18HD1fhRbCH67Az2dpCymeRE1SoPK6XQtaN2k
 * for address bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l — public BIP
 * test material, not real key material.
 */

/** 33-byte compressed pubkey shared by every vector (hash160 = the address's witness program). */
export const BIP322_P2WPKH_PUBKEY_HEX =
  "02c7f12003196442943d8588e01aee840423cc54fc1521526a3b85c2b0cbd58872";

/** x-only form of {@link BIP322_P2WPKH_PUBKEY_HEX}, as a depositor key would be normalized. */
export const BIP322_P2WPKH_PUBKEY_XONLY_HEX =
  "c7f12003196442943d8588e01aee840423cc54fc1521526a3b85c2b0cbd58872";

/**
 * Encoded signatures (DER ‖ 0x01 sighash byte) per message. Each message
 * carries the file's two variants: a 71-byte and a 72-byte encoding.
 */
export const BIP322_P2WPKH_SIGNATURES: ReadonlyArray<{
  readonly message: string;
  readonly encodedSignatureHexes: readonly [string, string];
}> = [
  {
    message: "",
    encodedSignatureHexes: [
      "30440220336801010aaf657d79662cac98a990a43ac6f376af2c84f8f76401ccb9d0231602201693a4e683db4a91944ca5cb11527840366daf583a2c695fccf8e93483b52e3401",
      "3045022100f909d50e28612d21b6fcae4851cbc51429140639e9bef452f13b0f16b37a7d1902202d65f173d52e93e88db731623694afe970d4d69dcbb22fc50bfa831dc9d560cc01",
    ],
  },
  {
    message: "Hello World",
    encodedSignatureHexes: [
      "304402206517c8637a7bfc3a154edcba6196d64bbd5b73955cb7da7d1626bcdde466c364022022bf10d19fc0bb69b4596e306b362acaa835293cf693bb176f7324b531f5afec01",
      "3045022100ecf2ca796ab7dde538a26bfb09a6c487a7b3fff33f397db6a20eb9af77c0ee8c022062e67e44c8070f49c3a37f5940a8850842daf7cca35e6af61a6c7c91f1e1a1a301",
    ],
  },
];

/**
 * The "Hello World" 71-byte-signature vector as a full consensus-encoded
 * two-item witness (`0x02 ‖ 0x47 ‖ sig ‖ 0x21 ‖ pubkey`), for callers
 * that consume the raw witness (e.g. `verifyPopWitness`).
 */
export const BIP322_P2WPKH_HELLO_WORLD_WITNESS_HEX = `0247${BIP322_P2WPKH_SIGNATURES[1].encodedSignatureHexes[0]}21${BIP322_P2WPKH_PUBKEY_HEX}`;
