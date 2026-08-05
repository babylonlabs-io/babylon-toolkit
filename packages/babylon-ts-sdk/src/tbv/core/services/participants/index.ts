/**
 * RFC-006 participant operation-key resolution.
 *
 * @module services/participants
 */

export {
  resolveCurrentParticipantKeys,
  resolveParticipantKeysAtEpochs,
} from "./resolveParticipantKeys";
export type {
  KeyResolutionMode,
  ParticipantKeySet,
  ResolvedParticipant,
} from "./types";
