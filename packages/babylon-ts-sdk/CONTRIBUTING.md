# Contributing to @babylonlabs-io/ts-sdk

## Development Workflow

### Building

```bash
pnpm build
```

### Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# UI mode
pnpm test:ui
```

### Linting & Formatting

```bash
# Check formatting
pnpm format

# Fix formatting
pnpm format:fix

# Lint code
pnpm lint

# Fix lint issues
pnpm lint:fix
```

### Generating Documentation

API documentation is auto-generated from TSDoc comments using [TypeDoc](https://typedoc.org/):

```bash
# Generate docs
pnpm docs:generate

# Clean and regenerate
pnpm docs:clean

# Validate docs without generating
pnpm docs:validate
```

> **Important**: The `docs/api/` directory contains auto-generated content. Do not edit these files directly. Instead, update TSDoc comments in the source code and regenerate the documentation.

## Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Add tests for new functionality
4. Update TSDoc comments if adding/modifying public APIs
5. Run `pnpm lint` and `pnpm test` to ensure everything passes
6. Submit a pull request

## Questions?

- [GitHub Issues](https://github.com/babylonlabs-io/babylon-toolkit/issues)
- [SDK Documentation](./README.md)
