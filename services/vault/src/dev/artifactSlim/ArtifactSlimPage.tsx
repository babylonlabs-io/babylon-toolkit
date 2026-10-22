/**
 * /dev/artifact-slim — pick a saved recovery artifact file, condense it in
 * the browser, download the slim file. See `slimArtifactFile.ts`.
 *
 * Dev-only tooling behind NEXT_PUBLIC_FF_ARTIFACT_SLIM_TOOL; never shipped.
 */

import { Button, Container, Heading, Text } from "@babylonlabs-io/core-ui";
import { VpResponseValidationError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useRef, useState, type ChangeEvent } from "react";

import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { COPY } from "@/copy";

import { slimArtifactFile, type SlimArtifactResult } from "./slimArtifactFile";

const BYTES_PER_MEGABYTE = 1_000_000;
const MILLISECONDS_PER_SECOND = 1000;
const DISPLAY_DECIMALS = 1;

/**
 * A Blob stream yields small chunks, so a 1.4 GB file reports progress tens
 * of thousands of times. Re-rendering at most this often keeps the scan, not
 * React, the cost.
 */
const PROGRESS_RENDER_INTERVAL_MS = 100;

const SLIM_FILE_TYPE = "application/json";

type Phase =
  | { kind: "idle" }
  | {
      kind: "running";
      bytesRead: number;
      totalBytes: number;
      elapsedMs: number;
    }
  | { kind: "done"; result: SlimArtifactResult }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

const formatMegabytes = (bytes: number) =>
  COPY.devArtifactSlim.megabytes(
    (bytes / BYTES_PER_MEGABYTE).toFixed(DISPLAY_DECIMALS),
  );

const formatSeconds = (ms: number) =>
  COPY.devArtifactSlim.seconds(
    (ms / MILLISECONDS_PER_SECOND).toFixed(DISPLAY_DECIMALS),
  );

/**
 * The validator's errors carry a generic user-facing `message` and the actual
 * reason in `detail`. This is a dev page, so show the reason.
 */
function describeError(err: unknown): string {
  if (err instanceof VpResponseValidationError) return err.detail;
  if (err instanceof Error) return err.message;
  return String(err);
}

function slimFileName(inputName: string): string {
  return `${inputName.replace(/\.json$/i, "")}.slim.json`;
}

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: SLIM_FILE_TYPE }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ArtifactSlimPage() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setPhase({ kind: "idle" });
  };

  const handleStart = async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = performance.now();
    let lastRenderAt = 0;
    setPhase({
      kind: "running",
      bytesRead: 0,
      totalBytes: file.size,
      elapsedMs: 0,
    });
    try {
      const result = await slimArtifactFile(file, {
        signal: controller.signal,
        onProgress: (bytesRead, totalBytes) => {
          const now = performance.now();
          if (now - lastRenderAt < PROGRESS_RENDER_INTERVAL_MS) return;
          lastRenderAt = now;
          setPhase({
            kind: "running",
            bytesRead,
            totalBytes,
            elapsedMs: now - startedAt,
          });
        },
      });
      setPhase({ kind: "done", result });
    } catch (err) {
      setPhase(
        controller.signal.aborted
          ? { kind: "cancelled" }
          : { kind: "error", message: describeError(err) },
      );
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancel = () => abortRef.current?.abort();

  const handleDownload = () => {
    if (!file || phase.kind !== "done") return;
    downloadText(phase.result.slimJson, slimFileName(file.name));
  };

  const running = phase.kind === "running";
  const copy = COPY.devArtifactSlim;

  return (
    <Container as="main" className={`${PAGE_CONTENT_CLASS} pb-6`}>
      <div className="flex max-w-2xl flex-col gap-6">
        <Heading variant="h5">{copy.title}</Heading>
        <Text className="text-accent-secondary">{copy.description}</Text>

        <input
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          disabled={running}
        />

        <div className="flex gap-3">
          <Button
            variant="contained"
            size="medium"
            onClick={handleStart}
            disabled={!file || running}
          >
            {copy.startButton}
          </Button>
          {running && (
            <Button variant="outlined" size="medium" onClick={handleCancel}>
              {copy.cancelButton}
            </Button>
          )}
        </div>

        {phase.kind === "running" && (
          <div className="flex flex-col gap-2">
            <progress
              className="w-full"
              value={phase.bytesRead}
              max={phase.totalBytes}
            />
            <Text variant="body2">
              {copy.progress(
                formatMegabytes(phase.bytesRead),
                formatMegabytes(phase.totalBytes),
                formatSeconds(phase.elapsedMs),
              )}
            </Text>
          </div>
        )}

        {phase.kind === "cancelled" && <Text>{copy.cancelled}</Text>}

        {phase.kind === "error" && (
          <div className="flex flex-col gap-1">
            <Text className="break-words text-error-main">{phase.message}</Text>
            <Text variant="body2" className="text-accent-secondary">
              {copy.expectedFileHint}
            </Text>
          </div>
        )}

        {phase.kind === "done" && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt>{copy.summary.prePeginOutpoint}</dt>
              <dd className="break-all font-mono">
                {phase.result.summary.prePeginOutpoint}
              </dd>
              <dt>{copy.summary.challengers}</dt>
              <dd>{phase.result.summary.challengerCount}</dd>
              <dt>{copy.summary.input}</dt>
              <dd>{formatMegabytes(phase.result.summary.inputBytes)}</dd>
              <dt>{copy.summary.output}</dt>
              <dd>{formatMegabytes(phase.result.summary.outputBytes)}</dd>
              <dt>{copy.summary.elapsed}</dt>
              <dd>{formatSeconds(phase.result.summary.elapsedMs)}</dd>
              <dt>{copy.summary.graphSha256}</dt>
              <dd className="break-all font-mono">
                {phase.result.summary.graphSha256}
              </dd>
            </dl>
            <div>
              <Button
                variant="contained"
                size="medium"
                onClick={handleDownload}
              >
                {copy.downloadButton}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
