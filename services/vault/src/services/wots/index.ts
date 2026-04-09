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
  computeWotsPublicKeysHash,
  createVerificationChallenge,
  deriveWotsBlockPublicKeys,
  deriveWotsPkHash,
  generateWotsMnemonic,
  getMnemonicWords,
  isValidMnemonic,
  isWotsMismatchError,
  mnemonicToWotsSeed,
  verifyMnemonicWords,
} from "./wotsService";
export type {
  VerificationChallenge,
  WotsBlockPublicKey,
  WotsConfig,
  WotsPublicKeys,
} from "./wotsService";
