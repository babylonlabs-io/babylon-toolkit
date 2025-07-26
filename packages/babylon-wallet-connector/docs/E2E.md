# E2E Testing Setup Guide

## Overview

These tests use Playwright to launch a Chromium instance with selected wallet
extensions. The required extensions (OKX, Keplr, etc.) download automatically as
part of the test setup.

You need to provide your 12 words mnemonic and a password (that is used for the
Chrome extension) in `.env.local`:

```env
E2E_WALLET_MNEMONIC="one two three four five six seven eight nine ten eleven twelve"
E2E_WALLET_PASSWORD="SomePasswordWithSymbols"
```

Use the following command to run the E2E tests:

```bash
npm run test:e2e
```

Additional test commands:

```bash
npm run test:e2e:ui      # Run tests with UI
npm run test:e2e:debug   # Run tests in debug mode
npm run test:e2e:headed  # Run tests in headed mode
```
