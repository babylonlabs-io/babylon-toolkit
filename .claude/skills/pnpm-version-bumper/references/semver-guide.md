# Semver Quick Reference Guide

Quick lookup for understanding and working with semantic versioning ranges in package managers.

## Common Semver Range Symbols

### Caret (`^`) - Compatible Releases

`^X.Y.Z` allows changes that do not modify the left-most non-zero digit:
- `^1.2.3` → `>=1.2.3 <2.0.0` (allows 1.2.4, 1.3.0, 1.9.9, but NOT 2.0.0)
- `^0.2.3` → `>=0.2.3 <0.3.0` (allows 0.2.4, 0.2.9, but NOT 0.3.0)
- `^0.0.3` → `>=0.0.3 <0.0.4` (allows ONLY 0.0.3 - very strict)

**Key Insight**: For 0.x versions, caret is more restrictive than you might expect.

### Tilde (`~`) - Patch-Level Changes

`~X.Y.Z` allows patch-level changes if Y is specified:
- `~1.2.3` → `>=1.2.3 <1.3.0` (allows 1.2.4, 1.2.9, but NOT 1.3.0)
- `~1.2` → `>=1.2.0 <1.3.0`
- `~1` → `>=1.0.0 <2.0.0`

**Use Case**: When you want bug fixes but no new features.

### Greater Than/Equal (`>=`, `>`, `<=`, `<`)

Exact comparisons:
- `>=1.2.3` → Any version 1.2.3 or higher
- `>1.2.3` → Any version strictly greater than 1.2.3
- `<=1.2.3` → Any version 1.2.3 or lower
- `<1.2.3` → Any version strictly less than 1.2.3

**Use Case**: Security requirements (e.g., `>=2.4.1` to avoid vulnerability in 2.4.0)

### Exact Version

`1.2.3` → Only version 1.2.3, nothing else

**Use Case**: When you need deterministic builds (rare in package.json, common in lockfiles)

### Hyphen Ranges (`X.Y.Z - A.B.C`)

Inclusive ranges:
- `1.2.3 - 2.3.4` → `>=1.2.3 <=2.3.4`

### X-Ranges (`*`, `X`)

Wildcards:
- `*` → Any version
- `1.x` or `1.*` → `>=1.0.0 <2.0.0`
- `1.2.x` → `>=1.2.0 <1.3.0`

## Special Cases with 0.x Versions

**Critical**: Versions starting with `0.` are considered unstable:
- `^0.2.5` does NOT allow `0.3.0` (breaking change in minor version)
- `^0.0.5` does NOT allow `0.0.6` (every patch could break)
- `~0.2.5` allows `0.2.6` but NOT `0.3.0`

This is why upgrading from `tmp@0.0.33` to `tmp@0.2.5` is a breaking change for `^0.0.33`.

## Checking If a Version Satisfies a Range

### Manual Check Algorithm

1. Parse the requirement symbol (`^`, `~`, `>=`, etc.)
2. Apply the rules above
3. Compare the version against the resulting range

### Examples

**Does 0.2.5 satisfy ^0.0.33?**
- `^0.0.33` → `>=0.0.33 <0.0.34`
- 0.2.5 is NOT in range [0.0.33, 0.0.34)
- **Answer: NO**

**Does 2.29.8 satisfy ^2.27.9?**
- `^2.27.9` → `>=2.27.9 <3.0.0`
- 2.29.8 is in range [2.27.9, 3.0.0)
- **Answer: YES**

**Does 1.0.2 satisfy >=1.0.0?**
- 1.0.2 >= 1.0.0
- **Answer: YES**

## Common Gotchas

1. **Caret with 0.x**: `^0.2.0` is NOT the same as `^1.2.0` - much more restrictive
2. **Tilde vs Caret**: `~1.2.3` allows fewer versions than `^1.2.3`
3. **Prerelease Versions**: `1.0.0-alpha.1` is less than `1.0.0`
4. **Build Metadata**: `1.0.0+20130313144700` - metadata after `+` is ignored in comparisons

## Quick Decision Tree

```
Need to check if version X satisfies requirement R?
│
├─ Is R exact (e.g., "1.2.3")?
│  └─ YES → X must equal R exactly
│
├─ Is R a range (>=, >, <, <=)?
│  └─ YES → Direct numerical comparison
│
├─ Is R caret (^)?
│  ├─ Major > 0? → Allow same major, any minor/patch
│  ├─ Major = 0, Minor > 0? → Allow same minor, any patch
│  └─ Major = 0, Minor = 0? → Allow same patch only
│
└─ Is R tilde (~)?
   └─ Allow same major.minor, any patch
```

## When to Load This Reference

Load this reference when:
- You need to manually determine if a version satisfies a requirement
- The user asks about semver ranges
- You encounter a complex or unfamiliar range pattern
- You need to explain why a version doesn't satisfy a requirement
