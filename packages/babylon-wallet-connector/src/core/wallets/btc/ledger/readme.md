```
//default taproot, index = 0
const provider = new LedgerProvider(wallet, config);
await provider.connectWallet();

//default taproot, index = 5
const provider = new LedgerProvider(wallet, config);
provider.setDerivationConfig({ addressIndex: 5 });
await provider.connectWallet();

//native segwit, index = 2
const provider = new LedgerProvider(wallet, config);
provider.setDerivationConfig({ purpose: 84, addressIndex: 2 });
await provider.connectWallet();
```