import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import testnet from '../src/testnet.json' with { type: 'json' };
import mainnet from '../src/mainnet.json' with { type: 'json' };

const repoRawPrefix = 'https://raw.githubusercontent.com/babylonlabs-io/babylon-toolkit/main/packages/babylon-bsn-registry/images/';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const imagesDir = path.join(rootDir, 'images');

const allIds = Array.from(
  new Set([...Object.keys(testnet || {}), ...Object.keys(mainnet || {})])
);

let errors = [];

for (const id of allIds) {
  const logoSvgPath = path.join(imagesDir, id, 'logo.svg');
  const logoPngPath = path.join(imagesDir, id, 'logo.png');

  if (!fs.existsSync(logoSvgPath) && !fs.existsSync(logoPngPath)) {
    errors.push(
      `Icon missing for ${id}: expected ${path.relative(
        rootDir,
        logoSvgPath
      )} or ${path.relative(rootDir, logoPngPath)}`
    );
  }
}

function validateLogoUrl(registryName, registry) {
  for (const [id, entry] of Object.entries(registry || {})) {
    if (!entry.logoUrl || typeof entry.logoUrl !== 'string') {
      errors.push(`${registryName}:${id} is missing logoUrl`);
      continue;
    }

    const hasCorrectPrefix = entry.logoUrl.startsWith(repoRawPrefix);
    const hasCorrectSuffix =
      entry.logoUrl.endsWith(`${id}/logo.svg`) ||
      entry.logoUrl.endsWith(`${id}/logo.png`);

    if (!hasCorrectPrefix || !hasCorrectSuffix)
      errors.push(`${registryName}:${id} has invalid logoUrl. Use ${repoRawPrefix}<bsn-id>/logo.(svg|png)`);
  }
}

validateLogoUrl('testnet', testnet);
validateLogoUrl('mainnet', mainnet);

if (errors.length > 0) {
  console.error('Validation failed:\n' + errors.map((e) => `- ${e}`).join('\n'));
  process.exit(1);
}

console.log('Registry icons OK');
