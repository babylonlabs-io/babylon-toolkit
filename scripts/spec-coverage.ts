#!/usr/bin/env tsx
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SPECS_DIR = join(REPO_ROOT, "specs");
const E2E_GLOBS = [join(REPO_ROOT, "services/vault/e2e")];

const STORY_HEADING_RE = /^### User Story (BT-\d{2})\b.*$/gm;
const ACCEPTANCE_HEADING_RE = /^\*\*Acceptance Scenarios\*\*:?$/m;
const NUMBERED_RE = /^\s*(\d+)\.\s/;
const TEST_AC_RE = /\[(BT-\d{2})-AC(\d+)\]/g;
const TEST_TAG_SPEC_RE = /@spec:([0-9]{3}-[a-z0-9-]+)/g;
const TEST_TAG_STORY_RE = /@story:(BT-\d{2})/g;

type StoryAcMap = Map<string, { spec: string; acIds: Set<string> }>;
type TestCoverage = Map<string, Set<string>>;
type TagMap = Map<string, Set<string>>;

function listDir(dir: string, suffix: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) listDir(full, suffix, out);
    else if (full.endsWith(suffix)) out.push(full);
  }
  return out;
}

function parseSpec(specPath: string, specSlug: string): StoryAcMap {
  const text = readFileSync(specPath, "utf8");
  const map: StoryAcMap = new Map();
  const matches = [...text.matchAll(STORY_HEADING_RE)];
  for (let i = 0; i < matches.length; i++) {
    const story = matches[i][1];
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const block = text.slice(start, end);
    const acs = extractAcceptanceCount(block);
    map.set(story, { spec: specSlug, acIds: acs });
  }
  return map;
}

function extractAcceptanceCount(block: string): Set<string> {
  const acs = new Set<string>();
  const headingMatch = block.match(ACCEPTANCE_HEADING_RE);
  if (!headingMatch) return acs;
  const after = block.slice((headingMatch.index ?? 0) + headingMatch[0].length);
  for (const line of after.split("\n")) {
    const m = line.match(NUMBERED_RE);
    if (m) acs.add(`AC${m[1]}`);
    else if (line.startsWith("###") || line.startsWith("---")) break;
  }
  return acs;
}

function parseTests(files: string[]): { coverage: TestCoverage; tags: { spec: TagMap; story: TagMap }; orphans: Array<{ file: string; story: string; ac: string }> } {
  const coverage: TestCoverage = new Map();
  const tagSpec: TagMap = new Map();
  const tagStory: TagMap = new Map();
  const orphans: Array<{ file: string; story: string; ac: string }> = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(TEST_AC_RE)) {
      const story = m[1];
      const ac = `AC${m[2]}`;
      if (!coverage.has(story)) coverage.set(story, new Set());
      coverage.get(story)!.add(ac);
    }
    for (const m of text.matchAll(TEST_TAG_SPEC_RE)) {
      const slug = m[1];
      if (!tagSpec.has(slug)) tagSpec.set(slug, new Set());
      tagSpec.get(slug)!.add(relative(REPO_ROOT, file));
    }
    for (const m of text.matchAll(TEST_TAG_STORY_RE)) {
      const story = m[1];
      if (!tagStory.has(story)) tagStory.set(story, new Set());
      tagStory.get(story)!.add(relative(REPO_ROOT, file));
    }
  }
  return { coverage, tags: { spec: tagSpec, story: tagStory }, orphans };
}

function loadAllSpecs(): { specs: StoryAcMap; specSlugs: Set<string> } {
  const merged: StoryAcMap = new Map();
  const slugs = new Set<string>();
  for (const slug of readdirSync(SPECS_DIR)) {
    const dir = join(SPECS_DIR, slug);
    if (!statSync(dir).isDirectory()) continue;
    slugs.add(slug);
    const spec = join(dir, "spec.md");
    try {
      statSync(spec);
    } catch {
      continue;
    }
    const parsed = parseSpec(spec, slug);
    for (const [story, info] of parsed) {
      if (merged.has(story)) {
        console.error(`error: story ${story} declared in multiple specs (${merged.get(story)!.spec} and ${info.spec})`);
        process.exitCode = 1;
      }
      merged.set(story, info);
    }
  }
  return { specs: merged, specSlugs: slugs };
}

function loadAllTests(): string[] {
  const files: string[] = [];
  for (const root of E2E_GLOBS) {
    try {
      statSync(root);
    } catch {
      continue;
    }
    listDir(root, ".spec.ts", files);
  }
  return files;
}

function main(): void {
  const { specs, specSlugs } = loadAllSpecs();
  const testFiles = loadAllTests();
  const { coverage, tags } = parseTests(testFiles);

  const issues: string[] = [];

  const storiesWithoutAnyTest: string[] = [];
  const partial: Array<{ story: string; missing: string[] }> = [];
  for (const [story, info] of specs) {
    const tested = coverage.get(story) ?? new Set();
    if (tested.size === 0) {
      storiesWithoutAnyTest.push(`${story} (${info.spec})`);
      continue;
    }
    const missing = [...info.acIds].filter((ac) => !tested.has(ac));
    if (missing.length > 0) partial.push({ story, missing });
  }

  const unknownStories: string[] = [];
  for (const story of coverage.keys()) {
    if (!specs.has(story)) unknownStories.push(story);
  }

  const unknownSpecTags: string[] = [];
  for (const slug of tags.spec.keys()) {
    if (!specSlugs.has(slug)) unknownSpecTags.push(slug);
  }

  const unknownStoryTags: string[] = [];
  for (const story of tags.story.keys()) {
    if (!specs.has(story)) unknownStoryTags.push(story);
  }

  console.log(`Specs scanned: ${specs.size} stories across ${specSlugs.size} feature folders`);
  console.log(`Test files scanned: ${testFiles.length}`);
  console.log("");
  console.log("Coverage by story:");
  for (const [story, info] of [...specs.entries()].sort()) {
    const tested = coverage.get(story) ?? new Set();
    const declared = info.acIds.size;
    const covered = [...tested].filter((ac) => info.acIds.has(ac)).length;
    const status = covered === declared && declared > 0 ? "OK" : tested.size === 0 ? "MISSING" : "PARTIAL";
    console.log(`  [${status}] ${story} (${info.spec}): ${covered}/${declared} ACs`);
  }

  if (storiesWithoutAnyTest.length > 0) {
    issues.push(`Stories with no e2e tests: ${storiesWithoutAnyTest.join(", ")}`);
  }
  for (const p of partial) {
    issues.push(`Story ${p.story} missing AC tests: ${p.missing.join(", ")}`);
  }
  if (unknownStories.length > 0) {
    issues.push(`Tests reference unknown stories: ${unknownStories.join(", ")}`);
  }
  if (unknownSpecTags.length > 0) {
    issues.push(`Tests use @spec tags that don't match any spec folder: ${unknownSpecTags.join(", ")}`);
  }
  if (unknownStoryTags.length > 0) {
    issues.push(`Tests use @story tags that don't match any story: ${unknownStoryTags.join(", ")}`);
  }

  if (issues.length > 0) {
    console.log("");
    console.log("Issues:");
    for (const issue of issues) console.log(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("All specs covered.");
}

main();
