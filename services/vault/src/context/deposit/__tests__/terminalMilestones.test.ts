import { describe, expect, it } from "vitest";

import { ContractStatus } from "../../../models/peginStateMachine";
import {
  collectTerminalMilestones,
  createTerminalMilestoneTracking,
} from "../terminalMilestones";

const activity = (id: string, contractStatus: number) => ({
  id,
  contractStatus,
});

// What the usePeginStorage merge fabricates for a pegin the indexer has not
// returned yet: a synthetic PENDING that was never observed on-chain.
const localOnly = (id: string) => ({
  id,
  contractStatus: ContractStatus.PENDING,
  isPending: true,
});

describe("collectTerminalMilestones", () => {
  it("emits activation.verified then deposit.completed as one vault transitions across polls", () => {
    const tracking = createTerminalMilestoneTracking();

    // First observation as PENDING seeds nothing and emits nothing.
    expect(
      collectTerminalMilestones(
        [activity("0xa", ContractStatus.PENDING)],
        tracking,
      ),
    ).toEqual([]);

    // Transition to VERIFIED emits activation.verified once.
    expect(
      collectTerminalMilestones(
        [activity("0xa", ContractStatus.VERIFIED)],
        tracking,
      ),
    ).toEqual([
      { event: "activation.verified", category: "activation", vaultId: "0xa" },
    ]);

    // Still VERIFIED next poll — no re-emit.
    expect(
      collectTerminalMilestones(
        [activity("0xa", ContractStatus.VERIFIED)],
        tracking,
      ),
    ).toEqual([]);

    // Transition to ACTIVE emits deposit.completed once.
    expect(
      collectTerminalMilestones(
        [activity("0xa", ContractStatus.ACTIVE)],
        tracking,
      ),
    ).toEqual([
      { event: "deposit.completed", category: "deposit", vaultId: "0xa" },
    ]);

    // Still ACTIVE — no re-emit.
    expect(
      collectTerminalMilestones(
        [activity("0xa", ContractStatus.ACTIVE)],
        tracking,
      ),
    ).toEqual([]);
  });

  it("seeds already-terminal vaults on first observation without emitting (no page-load burst)", () => {
    const tracking = createTerminalMilestoneTracking();

    // A dashboard load where the vault is already ACTIVE must NOT emit.
    expect(
      collectTerminalMilestones(
        [activity("0xold", ContractStatus.ACTIVE)],
        tracking,
      ),
    ).toEqual([]);

    // And never emits on subsequent polls either.
    expect(
      collectTerminalMilestones(
        [activity("0xold", ContractStatus.ACTIVE)],
        tracking,
      ),
    ).toEqual([]);
  });

  it("emits both milestones once when a seen vault jumps straight to ACTIVE", () => {
    const tracking = createTerminalMilestoneTracking();
    collectTerminalMilestones(
      [activity("0xb", ContractStatus.PENDING)],
      tracking,
    );

    // PENDING -> ACTIVE in one step still yields verified AND completed once each.
    expect(
      collectTerminalMilestones(
        [activity("0xb", ContractStatus.ACTIVE)],
        tracking,
      ),
    ).toEqual([
      { event: "activation.verified", category: "activation", vaultId: "0xb" },
      { event: "deposit.completed", category: "deposit", vaultId: "0xb" },
    ]);
  });

  it("emits both milestones once when a seen vault jumps straight to REDEEMED", () => {
    const tracking = createTerminalMilestoneTracking();
    collectTerminalMilestones(
      [activity("0xc", ContractStatus.PENDING)],
      tracking,
    );

    // PENDING -> REDEEMED (already redeemed by the time we observe it) still
    // yields verified AND completed once each, same as reaching ACTIVE.
    expect(
      collectTerminalMilestones(
        [activity("0xc", ContractStatus.REDEEMED)],
        tracking,
      ),
    ).toEqual([
      { event: "activation.verified", category: "activation", vaultId: "0xc" },
      { event: "deposit.completed", category: "deposit", vaultId: "0xc" },
    ]);

    // Still REDEEMED — no re-emit.
    expect(
      collectTerminalMilestones(
        [activity("0xc", ContractStatus.REDEEMED)],
        tracking,
      ),
    ).toEqual([]);
  });

  it("defers seeding while contractStatus is missing, so a vault first classified as ACTIVE does not emit", () => {
    const tracking = createTerminalMilestoneTracking();

    // No status: the field is optional, and reading it as PENDING would seed the
    // vault at a state it was never observed in. Must not seed or emit.
    expect(collectTerminalMilestones([{ id: "0xd" }], tracking)).toEqual([]);

    // Status arrives and the vault was already ACTIVE: this is its first real
    // observation, so it seeds silently instead of emitting a spurious milestone.
    expect(
      collectTerminalMilestones(
        [activity("0xd", ContractStatus.ACTIVE)],
        tracking,
      ),
    ).toEqual([]);
  });

  it("emits both milestones once when a seen vault jumps straight to LIQUIDATED", () => {
    const tracking = createTerminalMilestoneTracking();
    collectTerminalMilestones(
      [activity("0xe", ContractStatus.PENDING)],
      tracking,
    );

    // A liquidated vault necessarily activated first, so it converted: both
    // milestones still owe an emission, same as reaching ACTIVE.
    expect(
      collectTerminalMilestones(
        [activity("0xe", ContractStatus.LIQUIDATED)],
        tracking,
      ),
    ).toEqual([
      { event: "activation.verified", category: "activation", vaultId: "0xe" },
      { event: "deposit.completed", category: "deposit", vaultId: "0xe" },
    ]);
  });

  it("emits nothing for a vault that expires without activating", () => {
    const tracking = createTerminalMilestoneTracking();
    collectTerminalMilestones(
      [activity("0xf", ContractStatus.PENDING)],
      tracking,
    );

    // EXPIRED is a pre-activation abort, not a conversion.
    expect(
      collectTerminalMilestones(
        [activity("0xf", ContractStatus.EXPIRED)],
        tracking,
      ),
    ).toEqual([]);
  });

  it("does not seed from a localStorage-only row, so a vault that activated between sessions emits nothing", () => {
    const tracking = createTerminalMilestoneTracking();

    // Cold load: the indexer has not answered yet, so the merge fabricates a
    // PENDING row from localStorage. Seeding from it would classify the vault as
    // first seen at PENDING.
    expect(collectTerminalMilestones([localOnly("0xg")], tracking)).toEqual([]);

    // The indexer resolves and the vault was already ACTIVE — it activated while
    // the user was away. That is a prior-session transition: seed, don't emit.
    expect(
      collectTerminalMilestones(
        [activity("0xg", ContractStatus.ACTIVE)],
        tracking,
      ),
    ).toEqual([]);
  });

  it("does not seed from a localStorage-only row when the indexer first reports VERIFIED", () => {
    const tracking = createTerminalMilestoneTracking();

    expect(collectTerminalMilestones([localOnly("0xh")], tracking)).toEqual([]);

    // The repeating false positive this guards: without it the fabricated PENDING
    // seeds the vault, and every later poll at VERIFIED looks like a live
    // transition worth an activation.verified.
    expect(
      collectTerminalMilestones(
        [activity("0xh", ContractStatus.VERIFIED)],
        tracking,
      ),
    ).toEqual([]);
    expect(
      collectTerminalMilestones(
        [activity("0xh", ContractStatus.VERIFIED)],
        tracking,
      ),
    ).toEqual([]);
  });

  it("still emits for a deposit made in this session, once the indexer picks it up", () => {
    const tracking = createTerminalMilestoneTracking();

    // A fresh deposit is localStorage-only at first — skipped, not suppressed.
    collectTerminalMilestones([localOnly("0xi")], tracking);

    // The indexer picks it up at PENDING: this is its first real observation.
    collectTerminalMilestones(
      [activity("0xi", ContractStatus.PENDING)],
      tracking,
    );

    // The transition is now observed in-session and emits normally.
    expect(
      collectTerminalMilestones(
        [activity("0xi", ContractStatus.ACTIVE)],
        tracking,
      ),
    ).toEqual([
      { event: "activation.verified", category: "activation", vaultId: "0xi" },
      { event: "deposit.completed", category: "deposit", vaultId: "0xi" },
    ]);
  });

  it("tracks each vault in a multi-vault batch independently", () => {
    const tracking = createTerminalMilestoneTracking();
    collectTerminalMilestones(
      [
        activity("0xa", ContractStatus.PENDING),
        activity("0xb", ContractStatus.PENDING),
      ],
      tracking,
    );

    const emitted = collectTerminalMilestones(
      [
        activity("0xa", ContractStatus.VERIFIED),
        activity("0xb", ContractStatus.ACTIVE),
      ],
      tracking,
    );

    expect(emitted).toEqual([
      { event: "activation.verified", category: "activation", vaultId: "0xa" },
      { event: "activation.verified", category: "activation", vaultId: "0xb" },
      { event: "deposit.completed", category: "deposit", vaultId: "0xb" },
    ]);
  });
});
