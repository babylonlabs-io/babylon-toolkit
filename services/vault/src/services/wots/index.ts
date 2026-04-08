export {
  VaultTamperingError,
  addMnemonic,
  clearStoredMnemonic,
  getActiveMnemonicId,
  getMnemonicIdForPegin,
  hasMnemonicEntry,
  hasStoredMnemonic,
  linkPeginToMnemonic,
  unlockMnemonic,
} from "./mnemonicVaultService";
export {
  computeWotsPkHash,
  createVerificationChallenge,
  deriveWotsKeypair,
  deriveWotsPkHash,
  generateWotsMnemonic,
  getMnemonicWords,
  isValidMnemonic,
  isWotsMismatchError,
  keypairToPublicKey,
  mnemonicToWotsSeed,
  verifyMnemonicWords,
} from "./wotsService";
export type {
  VerificationChallenge,
  WotsKeypair,
  WotsPublicKey,
} from "./wotsService";
