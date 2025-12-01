# Ledger Babylon App Firmware Upgrade Guide

This document explains the upgrade process from Ledger Babylon App version 1.0 to 2.0, including upgrade procedures, new features, and version compatibility handling.

---

## 1. How to Upgrade

### 1.1 Pre-upgrade Checklist

- Ensure your Ledger device is connected to your computer
- Make sure Ledger Live is installed and updated to the latest version
- Have your recovery phrase backed up securely

### 1.2 Upgrade Steps

1. **Open Ledger Live**
   - Launch the Ledger Live application
   - Connect and unlock your Ledger device

2. **Navigate to Manager**
   - Select "Manager" from the left sidebar in Ledger Live
   - Confirm the access request on your device

3. **Locate Babylon App**
   - Search for "Babylon" in the app catalog
   - If an older version is installed, you'll see an "Update" button

4. **Install the Update**
   - Click the "Update" button
   - Wait for the update to complete
   - For first-time installation, click "Install"

5. **Verify the Upgrade**
   - After completion, open the Babylon App on your Ledger device
   - The version should display as 2.0.x

### 1.3 Important Notes

- Do not disconnect the device during the upgrade process
- Your assets remain secure throughout the upgrade
- Existing accounts and addresses remain unchanged after upgrade

---

## 2. New Version Features

### 2.1 Major Feature Additions

#### 2.1.1 Expand Functionality
- **New Expand Operation**: Version 2.0 introduces the expand feature, allowing users to extend their staking positions

#### 2.1.2 Native SegWit Address Support
- **Native SegWit for Staking and Expand**: Full support for native SegWit addresses in staking and expand operations


#### 2.1.3 Extended PoP Signature Message Length
- **Increased Message Length**: Proof-of-Possession (PoP) signature now supports messages up to 128 bytes (increased from previous limit)

#### 2.1.4 Flexible Derivation Path Control
- **SDK-Configurable Last Derivation Level**: Developers can now specify the final derivation path level through the SDK

#### 2.1.5 Simplified User Interface (Coming Soon)
ß

### 2.2 Technical Improvements

#### 2.2.1 API Enhancements
- New API endpoints for expand operations
- Enhanced address generation APIs with native SegWit support
- Flexible derivation path configuration options
- Extended message length support in signing APIs

#### 2.2.2 Compatibility
- Backward compatible with version 1.0 basic functionality
- All legacy address formats continue to be supported
- Existing staking operations remain unchanged

### 2.3 Feature Comparison

| Feature | Version 1.0 | Version 2.0 |
|---------|-------------|-------------|
| Expand Operations | ❌ Not Available | ✅ Supported |
| Native SegWit Staking | ❌ Not Available | ✅ Supported |
| Native SegWit Expand | ❌ Not Available | ✅ Supported |
| PoP Message Length | 64 bytes | ✅ 128 bytes |
| Derivation Path Control | Fixed | ✅ SDK Configurable |
| Simplified UI | Standard | 🔄 In Progress |

---

## 3. Version Compatibility and User Notifications

### 3.1 Compatibility Matrix

| Firmware Version | Frontend Version | Compatibility | Notes |
|-----------------|------------------|---------------|-------|
| 1.0.x | Legacy Frontend | ✅ Fully Compatible | Basic features work normally |
| 1.0.x | New Frontend | ⚠️ Partially Compatible | Basic features available, new features unavailable |
| 2.0.x | Legacy Frontend | ✅ Backward Compatible | All legacy features work normally |
| 2.0.x | New Frontend | ✅ Fully Compatible | All features available (recommended) |

### 3.2 User Notification Scenarios

#### 3.2.1 Scenario 1: Legacy Firmware (1.0.x) + New Frontend

**Detection Logic:**
```
Frontend detects Ledger device running Babylon App version 1.0.x
```

**User Notification:**
```
⚠️ Firmware Update Required

Users get error message when trying to connect wallet.

Your Ledger Babylon App version is 1.0.x.
It must be upgrading to version 2.0 before using
```

**Feature Restrictions:**
- Disable function buttons requiring 2.0 features
- Display "Upgrade Required" badge on relevant feature entries
- Allow basic staking and withdrawal functionality

#### 3.2.2 Scenario 2: New Firmware (2.0.x) + Legacy Frontend

**Detection Logic:**
```
Ledger device running version 2.0.x, but frontend application is outdated using v1' sdk.
```

**User Notification:**
```
Users get SW1SW2 error message 0x6a80 when trying to sign the psbt.

The new version firmware won't work with old frontend.
```


**Last Updated:** December 1, 2025