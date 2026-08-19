/** Whatever `releasePublish` reported, narrowed to what this module needs. */
export type PublishResults = Record<string, { code: number } | undefined>;

/**
 * A project missing from the results was dropped before the executor ran. nx
 * does that silently for any package without a publish target, which is every
 * package marked `private` - and it is exactly how a signer version got
 * versioned, tagged and pinned by wallet-connector without ever being
 * published. Checking only the exit codes passes vacuously in that case.
 *
 * A missing project is fatal even during a dry run: the drop is just as real
 * there. A non-zero exit code is only tolerated during a dry run, where nothing
 * writes the new version to disk so the packed manifest is the previous
 * release, which the registry already has.
 */
export const assertEveryProjectPublished = (
  projectsToPublish: readonly string[],
  publishResults: PublishResults,
  { dryRun }: { dryRun: boolean }
): void => {
  const dropped = projectsToPublish.filter(
    (projectName) => publishResults[projectName] === undefined
  );

  if (dropped.length > 0) {
    throw new Error(
      `These projects were versioned but nx never ran a publish for them: ${dropped.join(', ')}. That happens when a package has no publish target, which is the case for any package marked "private". A dependent pinning one of them would ship a version that will never exist.`
    );
  }

  const failed = projectsToPublish.filter(
    (projectName) => publishResults[projectName]?.code !== 0
  );

  if (failed.length === 0) return;

  const summary = `These projects were versioned but did not publish successfully: ${failed.join(', ')}.`;

  if (dryRun) {
    console.warn(
      `${summary} A dry run does not write the new versions to disk, so the packed manifest is the previous release and the registry already has it.`
    );
    return;
  }

  throw new Error(
    `${summary} Any package that did publish is already immutable on the registry; check which ones landed before re-running, because the publish executor skips a version it finds already published.`
  );
};
