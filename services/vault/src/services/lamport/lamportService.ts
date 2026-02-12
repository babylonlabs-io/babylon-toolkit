import { ripemd160 } from "@noble/hashes/legacy.js";
import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const LAMPORT_DOMAIN_PREFIX = "babylon-lamport";
const LAMPORT_KEY_SLOTS = 512;
const GC_LABEL_SIZE = 16;

export interface LamportKeypair {
  privateKey: Uint8Array[];
  publicKey: Uint8Array[];
}

export interface VerificationChallenge {
  indices: number[];
  expectedWords: string[];
}

export function generateLamportMnemonic(): string {
  return generateMnemonic(wordlist, 256);
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

export function getMnemonicWords(mnemonic: string): string[] {
  return mnemonic.split(" ");
}

export function createVerificationChallenge(
  mnemonic: string,
  count: number = 3,
): VerificationChallenge {
  const words = getMnemonicWords(mnemonic);
  const indices: number[] = [];

  while (indices.length < count) {
    const index = Math.floor(Math.random() * words.length);
    if (!indices.includes(index)) {
      indices.push(index);
    }
  }

  indices.sort((a, b) => a - b);

  return {
    indices,
    expectedWords: indices.map((i) => words[i]),
  };
}

export function verifyMnemonicWords(
  challenge: VerificationChallenge,
  answers: string[],
): boolean {
  if (answers.length !== challenge.expectedWords.length) return false;
  return challenge.expectedWords.every(
    (word, i) => word.toLowerCase() === answers[i].toLowerCase().trim(),
  );
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

async function hmacSha256(
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return new Uint8Array(signature);
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

async function hash160(data: Uint8Array): Promise<Uint8Array> {
  const sha = await sha256(data);
  return ripemd160(sha);
}

export function mnemonicToLamportSeed(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic);
  return new Uint8Array(seed);
}

export async function deriveLamportKeypair(
  seed: Uint8Array,
  peginId: string,
  depositorPk: string,
): Promise<LamportKeypair> {
  const domainData = concatBytes(
    stringToBytes(LAMPORT_DOMAIN_PREFIX),
    stringToBytes(peginId),
    stringToBytes(depositorPk),
  );

  const privateKey: Uint8Array[] = [];
  const publicKey: Uint8Array[] = [];

  for (let i = 0; i < LAMPORT_KEY_SLOTS; i++) {
    const indexBytes = new Uint8Array(4);
    new DataView(indexBytes.buffer).setUint32(0, i, false);
    const input = concatBytes(domainData, indexBytes);
    const derived = await hmacSha256(seed, input);
    const privateValue = derived.slice(0, GC_LABEL_SIZE);
    const publicValue = await hash160(privateValue);
    privateKey.push(privateValue);
    publicKey.push(publicValue);
  }

  return { privateKey, publicKey };
}

export function keypairToHex(keypair: LamportKeypair): {
  privateKey: string[];
  publicKey: string[];
} {
  const toHex = (bytes: Uint8Array) =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  return {
    privateKey: keypair.privateKey.map(toHex),
    publicKey: keypair.publicKey.map(toHex),
  };
}
