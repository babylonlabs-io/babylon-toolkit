---
name: write-docs
description: >
  Write or review technical documentation following a specific
  human writing style. Use when asked to write docs, documentation,
  guides, specs, or review existing documentation for style.
argument-hint: "[topic or file path]"
---

# Technical Documentation Style Guide

Write documentation that is dense, structured, and trusts the
reader. Every sentence must carry new information. Default to
tables and annotated code blocks over prose paragraphs.

Wrap all lines in markdown files to 80 characters.

## Content Structure

- **Section pattern**: One-sentence intro, then structured content
  (table/list/code block), then callout notes if needed. Never a
  warm-up paragraph.
- **Annotated code blocks** are the primary explanation for
  configuration. Inline comments in the code replace prose
  descriptions of fields.
  ```toml
  btc_confirmation_depth = 6  # Required confirmations (default: 6)
  ```
- **Tables** for any reference data (specs, parameters, ports,
  assets, addresses, metrics). Never write specs as prose
  paragraphs.
- **"Bold label": pattern**: Use
  `**Bold label**: Description continues as flowing text.` for
  lists of properties or capabilities.
- **Numbered lists** only for sequential steps. Bullet lists for
  non-ordered items.
- **Prerequisites** are terse bullet lists, not paragraphs.
- **CLI command explanations**: Use "This command:" followed by a
  numbered list of discrete actions.
- **Operational guides** follow this skeleton: Introduction,
  Requirements, Installation, Keys, Configuration, Starting,
  Registration, Operations, Recovery.

## Writing Rules

- Every sentence must introduce new information. No filler
  transitions ("Furthermore", "Additionally", "It's worth noting",
  "Let's explore", "In today's", "It is important to").
- No meta-commentary ("In this section, we will discuss..."). The
  heading is the signpost.
- No enthusiasm adjectives: robust, powerful, elegant, innovative,
  seamless, cutting-edge, comprehensive, streamlined, versatile.
  Describe things by what they do.
- Declarative statements ("The depositor submits..."), not hedged
  language ("The depositor would typically submit...").
- Introduce a concept once. Reference it later without
  re-explaining.
- Trust the reader's technical competence. Do not over-explain.
- No summary or conclusion section. End when the content ends.
- If a section is incomplete, say so explicitly with a note. Do not
  generate plausible-sounding filler.
- No "Let's", no first person plural ("we"), no "you will learn".
- No introductory "hook" sentences at the start of sections.

## Callouts and Warnings

Use blockquotes for warnings and notes. Warnings must state the
**specific consequence** of ignoring them, not generic "be careful"
advice.

Hierarchy:
- `> ⚠️ **Critical**:` - Irreversible consequences (key loss,
  slashing, data loss)
- `> ⚠️ **Important**:` - Serious but recoverable issues
- `> **Note**:` - Informational context

Bad:
`> ⚠️ **Important**: Make sure to configure this correctly.`

Good:
`> ⚠️ **Important**: Incorrect covenant committee keys will make
your stake unverifiable and temporarily freeze your funds on
Bitcoin.`

## Cross-References

- Link with a single line:
  `See [Doc Name](link) for details.`
- Do not summarize what the linked document contains.

## Formatting Details

- Ground abstract concepts with one parenthetical example inline:
  `(e.g., lending on Aave)`. Do not create separate example
  paragraphs or list 3-5 examples when one suffices.
- Use consistent heading hierarchy: `##` for main sections,
  `###` for subsections.
- Place images immediately before the text that explains them.
- Use HTML `<br/>` in table cells for multi-line content rather
  than creating additional rows.
- Wrap all lines to 80 characters in markdown files.
