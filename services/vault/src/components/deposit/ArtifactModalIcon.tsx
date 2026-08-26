// Path for the inner glyph of the artifact dialogs' 90x90 icon. The states
// share the same document-with-corner outline and differ only here: a shield
// before the download starts, a download arrow while it streams, a checkmark
// once the artifacts are on disk.
const ARTIFACT_ICON_GLYPH = {
  downloaded: "M48.75 71.25L60 80.625L76.875 60",
  downloading:
    "M63.75 52.5V75M50.625 61.875L63.75 75L76.875 61.875M50.625 82.5H76.875",
  pending:
    "M50.625 58.5C50.625 56.4999 63.75 52.5 63.75 52.5C63.75 52.5 76.875 56.4999 76.875 58.5C76.875 74.4999 63.75 82.5 63.75 82.5C63.75 82.5 50.625 74.4999 50.625 58.5Z",
} as const;

export function ArtifactModalIcon({
  variant,
}: {
  variant: keyof typeof ARTIFACT_ICON_GLYPH;
}) {
  return (
    <svg
      width="90"
      height="90"
      viewBox="0 0 90 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-accent-primary"
      aria-hidden="true"
    >
      <path
        d="M75 43.125V26.25L58.125 7.5H18.75C16.6789 7.5 15 9.17893 15 11.25V78.75C15 80.8211 16.6789 82.5 18.75 82.5H41.25"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={ARTIFACT_ICON_GLYPH[variant]}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M56.25 7.5V26.25H75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
