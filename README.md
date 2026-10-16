# visual-diffs

Machine-written. Holds the before/after PNGs that the Visual regression
check embeds in pull request comments, and nothing else.

- Written only by `.github/workflows/visual-regression.yml`.
- Shares no history with `main`. Never merge it anywhere.
- Rewritten as one parentless commit per publish, so the branch has no
  history to grow and a fresh clone transfers only the live tree.
- Laid out as `pr<number>/<short-sha>-<run-id>-<run-attempt>/`. The whole
  `pr<number>/` directory is deleted once that pull request closes, so
  images in comments on closed pull requests will 404.
- Safe to delete outright. The next run recreates it.
