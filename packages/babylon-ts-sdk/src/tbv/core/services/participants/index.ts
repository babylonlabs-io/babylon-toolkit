/**
 * RFC-006 participant operation-key resolution.
 *
 * @module services/participants
 */

export {
  assertVaultProviderHintAccepted,
  isHintAccepted,
  matchKeyHint,
  matchKeySetHint,
} from "./indexerKeyHint";
export type {
  AssertVaultProviderHintAcceptedParams,
  HintMatch,
} from "./indexerKeyHint";
export {
  resolveCurrentParticipantKeys,
  resolveParticipantKeysAtEpochs,
} from "./resolveParticipantKeys";
export type {
  KeyResolutionMode,
  ParticipantKeySet,
  ResolvedParticipant,
} from "./types";
