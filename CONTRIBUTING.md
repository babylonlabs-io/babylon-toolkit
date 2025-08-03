# Contributing

bbn-toolkit repository follows the same contributing rules as
[Babylon node](https://github.com/babylonlabs-io/babylon/blob/main/CONTRIBUTING.md)
repository.

# Getting Started

## Prerequisites
- Node.js (version 22 or later)
- NPM

```bash
npm install
```

### Build

To build the whole repository, run:

```bash
npm run build
```

### Linting

To run the linter, use the following command:

```bash
npm run lint
```

## Use nx command to learn the project dependency graph and available commands

```bash
npx nx graph
```

## Running build of a specific package

To build a specific package, use the following command:
```bash
npx nx build @babylonlabs-io/core-ui
```

Similarly, you can run tests for a specific package:

```bash
npx nx lint @babylonlabs-io/core-ui
```

## Release

We use conventional commits to manage releases. To make sure a release happens, you need to follow the commit message format. For more information, refer to the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

Note: When we squash commits on Github, there is no way for us to validate the commit message. So please make sure you follow the commit message format before you squash and merge commits.