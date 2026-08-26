/**
 * Human-readable progress label shown above the Keystone QR while signing a
 * batch of PSBTs, so the user can track how far through they are (Keystone signs
 * one PSBT per QR scan, so a 10+ PSBT payout flow is otherwise opaque).
 *
 * @param index - zero-based position of the PSBT in the batch
 * @param total - total number of PSBTs in the batch
 */
export const signingProgressLabel = (index: number, total: number): string =>
  `Transaction ${index + 1} of ${total}`;
