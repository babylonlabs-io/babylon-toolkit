# pnpm Overrides Guide

## When to Use Overrides

Overrides are a **last resort** for forcing a specific package version when:
1. Walking up the dependency tree found no solution
2. A parent package has a restrictive semver range that can't be upgraded
3. You need to apply a security patch that parent packages haven't adopted yet
4. A transitive dependency has a known bug that's fixed in a newer version

**Do NOT use overrides** when:
- A parent package CAN be upgraded to solve the problem
- The override would introduce breaking changes you haven't tested
- You're unsure about compatibility

## pnpm.overrides Syntax

In your root `package.json`, add a `pnpm.overrides` field:

```json
{
  "name": "my-monorepo",
  "pnpm": {
    "overrides": {
      "package-name": "version"
    }
  }
}
```

### Basic Override Examples

**Override all instances of a package:**
```json
{
  "pnpm": {
    "overrides": {
      "tmp": "0.2.5"
    }
  }
}
```
This forces ALL occurrences of `tmp` to use version 0.2.5, regardless of what parent packages specify.

**Override only within a specific parent:**
```json
{
  "pnpm": {
    "overrides": {
      "external-editor>tmp": "0.2.5"
    }
  }
}
```
This forces `tmp` to 0.2.5 ONLY when it's a dependency of `external-editor`.

**Override with a semver range:**
```json
{
  "pnpm": {
    "overrides": {
      "tmp": ">=0.2.4"
    }
  }
}
```
This ensures `tmp` is at least version 0.2.4.

## Advanced Patterns

### Nested Dependency Overrides

```json
{
  "pnpm": {
    "overrides": {
      "@changesets/cli>external-editor>tmp": "0.2.5"
    }
  }
}
```
Only override `tmp` when it's a dependency of `external-editor` which is a dependency of `@changesets/cli`.

### Wildcard Overrides

```json
{
  "pnpm": {
    "overrides": {
      "foo@2.x": "2.5.0"
    }
  }
}
```
Override all 2.x versions of `foo` with 2.5.0.

### Multiple Overrides

```json
{
  "pnpm": {
    "overrides": {
      "tmp": "0.2.5",
      "lodash": "4.17.21",
      "external-editor>iconv-lite": "0.7.0"
    }
  }
}
```

## Risks and Considerations

### Breaking Changes
- **Risk**: The overridden version may introduce breaking API changes
- **Mitigation**: Test thoroughly before deploying
- **Example**: Overriding `tmp@0.0.33` to `tmp@0.2.5` could break if `external-editor` depends on `tmp` 0.0.x-specific APIs

### Build Failures
- **Risk**: Parent package may not work with the overridden version
- **Mitigation**: Run full test suite after applying override
- **Example**: Type mismatches, missing methods, changed function signatures

### Hidden Dependencies
- **Risk**: Other packages may also depend on the package you're overriding
- **Mitigation**: Use `pnpm why <package>` to see all dependents before overriding
- **Example**: Overriding `lodash` might affect 20+ packages

### Maintenance Burden
- **Risk**: Overrides bypass normal dependency resolution, requiring manual maintenance
- **Mitigation**: Document WHY each override exists and plan to remove it
- **Example**: When parent packages update their dependencies, your override might become unnecessary or even harmful

## Best Practices

### 1. Document Your Overrides

Add comments in package.json:
```json
{
  "pnpm": {
    "overrides": {
      "tmp": "0.2.5"
    }
  },
  "_comments": {
    "overrides": {
      "tmp": "Force >=0.2.4 due to security vulnerability CVE-XXXX. Remove when external-editor updates to 4.x (see issue #123)"
    }
  }
}
```

### 2. Be Specific

Prefer:
```json
"external-editor>tmp": "0.2.5"  // Only override in this context
```

Over:
```json
"tmp": "0.2.5"  // Affects everything
```

### 3. Plan for Removal

Set a reminder to:
1. Check if parent packages have updated
2. Test removing the override
3. Remove the override when it's no longer needed

### 4. Test Thoroughly

After adding an override:
```bash
# Clean install to ensure override takes effect
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Verify the override worked
pnpm why <package>

# Run tests
pnpm test

# Check build
pnpm build
```

## Workflow for Applying Overrides

1. **Confirm necessity**: Verify that walking up the dependency tree won't work
2. **Check impact**: Run `pnpm why <package>` to see all affected dependencies
3. **Choose specificity**: Use the most specific override pattern possible
4. **Document reason**: Add a comment explaining why the override is needed
5. **Apply override**: Add to pnpm.overrides in package.json
6. **Clean install**: Delete lockfile and node_modules, run `pnpm install`
7. **Verify**: Check that the correct version is now installed
8. **Test thoroughly**: Run full test suite
9. **Set reminder**: Plan to review and potentially remove the override later

## Example: Applying Override for tmp

**Scenario**: `tmp@0.0.33` doesn't meet security requirement `>=0.2.4`, and `external-editor@3.1.0` (which depends on it) is the latest version.

**Solution**:

```json
{
  "pnpm": {
    "overrides": {
      "external-editor>tmp": "0.2.5"
    }
  },
  "_comments": {
    "overrides": {
      "tmp": "Override tmp to 0.2.5 for external-editor because external-editor@3.1.0 specifies ^0.0.33 which doesn't meet our >=0.2.4 security requirement. Remove when external-editor 4.x is released or we can switch to @inquirer/external-editor."
    }
  }
}
```

Then:
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm why tmp@0.0.33  # Should return empty
pnpm why tmp         # Should show only 0.2.5
```

## When Overrides Don't Help

Overrides can't solve:
- Actual incompatibilities (your code WILL break if the API changed)
- Peer dependency conflicts (different mechanism)
- Platform-specific issues
- Issues requiring code changes in your application

In these cases, you may need to:
- Wait for the parent package to update
- Find an alternative package
- Fork and patch the dependency
- Refactor your code

## When to Load This Reference

Load this reference when:
- Walking up the dependency tree found no solution
- User asks about forcing a package version
- You need to explain pnpm overrides syntax
- You need to weigh the risks of using overrides
