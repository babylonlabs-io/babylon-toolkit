// Fill shown behind wallet marks that ship as a single-colour glyph with no
// background of their own (OKX, Ledger, Keystone, OneKey). Without it the mark
// disappears against a same-coloured surface — black glyphs vanish in dark mode.
// Wallets whose logo already carries its own colour (MetaMask, UniSat, Keplr)
// leave `iconBackground` undefined and render bare.
export const MONOCHROME_MARK_BACKGROUND = "#000000";

export const ONEKEY_BRAND_GREEN = "#1FE121";
