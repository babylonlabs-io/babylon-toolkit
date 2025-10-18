import { exec } from "child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync } from "fs";
import { readFile, unlink, writeFile } from "fs/promises";
import https from "https";
import { join } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Strips the CRX header by finding the "PK\x03\x04" signature
 * and writes the extracted ZIP data to a temporary file. Then unzips.
 *
 * @param crxPath - Path to the CRX file.
 * @param outputDir - Directory where the extracted files will be stored.
 * @returns Promise that resolves when extraction is complete.
 */
async function extractCrx(crxPath: string, outputDir: string): Promise<void> {
  // Read the entire CRX file
  const crxBuffer = await readFile(crxPath);

  // The reliable way to find the ZIP data is to look for "PK\x03\x04"
  // because CRX2/CRX3 headers vary in size.
  const zipStart = crxBuffer.indexOf("PK\x03\x04");
  if (zipStart < 0) {
    throw new Error("Could not find ZIP header (PK\\x03\\x04) in CRX file.");
  }

  // Slice from the "PK\x03\x04" signature to the end
  const zipBuffer = crxBuffer.slice(zipStart);

  // Create a temporary ZIP file
  const zipPath = `${crxPath}.zip`;
  await writeFile(zipPath, zipBuffer);

  // Unzip the temporary ZIP file
  // Use a try/finally so we always remove the .zip file,
  // even if unzip fails.
  try {
    // (remove the -qq flag if you want to see unzip logs)
    await execAsync(`unzip -qq -o "${zipPath}" -d "${outputDir}"`);
  } finally {
    // Clean up the temporary file regardless of success/failure
    await unlink(zipPath).catch(() => {
      // Ignore errors if the file doesn't exist or can't be removed
    });
  }
}

/**
 * Configuration interface for Chrome extensions
 */
interface ExtensionConfig {
  /** Chrome Web Store extension ID */
  id: string;
  /** Human-readable extension name */
  name: string;
  /** Inner extension ID (if different from the Chrome Web Store ID) */
  innerId: string;
}

/**
 * Constants for extension IDs, used for downloading
 */
export const EXTENSION_CHROME_STORE_IDS = {
  OKX: "mcohilncbfahbmgdjkbpemcciiolgcge",
  KEPLR: "dmkamcknogkgcdfhhbddcghachkejeap",
  ONEKEY: "jnmbobjmhlngoefaiojfljckilhhlhcj",
};

// Inner chrome extension ID
export const EXTENSION_CHROME_INNER_IDS = {
  OKX: "aoidgejanlhnakicljcclfajchjdfceo", // 3.36.5
  KEPLR: "ffcjkjnakmchilamdbbpmfngggmacghh", // 0.12.169
  ONEKEY: "nkipngmnokmlggfbiemjdonfcheaplfa", // 5.5.1
};

/**
 * List of Chrome extensions required for E2E testing
 */
export const EXTENSIONS: ExtensionConfig[] = [
  { name: "OKX", id: EXTENSION_CHROME_STORE_IDS.OKX, innerId: EXTENSION_CHROME_INNER_IDS.OKX },
  { name: "Keplr", id: EXTENSION_CHROME_STORE_IDS.KEPLR, innerId: EXTENSION_CHROME_INNER_IDS.OKX },
  { name: "OneKey", id: EXTENSION_CHROME_STORE_IDS.ONEKEY, innerId: EXTENSION_CHROME_INNER_IDS.OKX },
];

// Directory where extensions will be downloaded and stored
export const EXTENSIONS_DIR = join(process.cwd(), "tests/e2e/fixtures/extensions");

/**
 * Downloads a Chrome extension from the Chrome Web Store
 *
 * @param extension - Configuration for the extension to download
 * @returns Promise that resolves to the path where the extension was saved
 */
export const downloadExtension = async (extension: ExtensionConfig): Promise<string> => {
  const { id, name } = extension;

  // Chrome Web Store direct download URL
  const downloadUrl = `https://clients2.google.com/service/update2/crx?response=redirect&os=mac&arch=x86-32&os_arch=x86-32&nacl_arch=x86-32&prod=chromecrx&prodchannel=unknown&prodversion=9999.0.9999.0&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;

  // Create the directory where we'll store the CRX file
  const extensionDir = join(EXTENSIONS_DIR, name);
  if (!existsSync(extensionDir)) {
    mkdirSync(extensionDir, { recursive: true });
  }

  return new Promise<string>((resolve, reject) => {
    // Make an initial request to get the redirect URL
    const request = https.get(downloadUrl, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error("Redirect location not found"));
          return;
        }

        // Follow the redirect to download the CRX
        https
          .get(redirectUrl, (finalResponse) => {
            // Extract a version from the filename in the redirect URL
            const urlParts = redirectUrl.split("/");
            const filename = urlParts[urlParts.length - 1];
            if (!filename) {
              reject(new Error("Could not extract filename from redirect URL"));
              return;
            }

            // Example: mcohilncbfahbmgdjkbpemcciiolgcge_3_34_19_0.crx
            // => version = 3.34.19.0
            const versionParts = filename.split("_").slice(1, -1);
            const version = versionParts.join(".");
            const extensionPath = join(extensionDir, `${id}_${version}.crx`);

            // If this version was downloaded before, skip
            if (existsSync(extensionPath)) {
              console.log(`\n${name} extension version ${version} already exists, skipping download...`);
              resolve(extensionPath);
              finalResponse.destroy();
              return;
            }

            // Download CRX file
            const file = createWriteStream(extensionPath);
            const totalSize = parseInt(finalResponse.headers["content-length"] || "0", 10);
            let downloadedSize = 0;

            console.log(`\nDownloading ${name} extension v${version}...`);

            // Show download progress
            finalResponse.on("data", (chunk: Buffer) => {
              downloadedSize += chunk.length;
              const percentage = totalSize ? Math.round((downloadedSize / totalSize) * 100) : 0;
              process.stdout.write(`Progress: ${percentage}% (${downloadedSize}/${totalSize} bytes)\r`);
            });

            // Pipe response to CRX file
            finalResponse.pipe(file);

            // On download finish
            file.on("finish", async () => {
              try {
                process.stdout.write(`\nCompleted downloading ${name} extension v${version}\n`);
                file.close();

                // Directory to unpack the CRX into
                const outputDir = extensionPath.replace(".crx", "");

                // Extract CRX file (removes leftover .zip automatically)
                await extractCrx(extensionPath, outputDir);
                console.log(`Successfully unpacked ${name} to ${outputDir}`);

                resolve(extensionPath);
              } catch (error) {
                reject(error);
              }
            });

            file.on("error", (err) => {
              file.close();
              reject(err);
            });
          })
          .on("error", reject);
      } else {
        reject(new Error("Expected a redirect response from the Chrome Web Store"));
      }
    });

    request.on("error", reject);
  });
};

/**
 * Downloads all configured extensions
 *
 * @returns Promise that resolves to array of paths where extensions were saved
 */
export const downloadAllExtensions = async (): Promise<string[]> => {
  const paths: string[] = [];

  for (const extension of EXTENSIONS) {
    try {
      const extensionPath = await downloadExtension(extension);
      paths.push(extensionPath);
      console.log(`✓ Downloaded ${extension.name}`);
    } catch (error) {
      console.error(`✗ Failed to download ${extension.name}:`, error);
    }
  }

  return paths;
};

// Run if called directly (not imported as a module)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  downloadAllExtensions()
    .then(() => {
      // Explicitly exit after downloads complete
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error downloading extensions:", error);
      process.exit(1);
    });
}

/**
 * Retrieves the path to a specific extension based on its ID and optional version.
 *
 * @param id - The unique identifier of the extension.
 * @param version - (Optional) The specific version of the extension to retrieve.
 * @returns The path to the extension file.
 * @throws Will throw an error if the specified version is not found.
 */
export function getExtensionPath(id: string, version?: string) {
  // Find the extension config to get the name
  const extension = EXTENSIONS.find((e) => e.id === id);
  if (!extension) {
    throw new Error(`Extension with ID ${id} is not configured in EXTENSIONS.`);
  }

  const extensionDir = join(EXTENSIONS_DIR, extension.name);
  if (!existsSync(extensionDir)) {
    throw new Error(`Extensions directory ${extensionDir} does not exist. Run 'npm run extensions:download' first.`);
  }

  // Look for unpacked extension directories that start with the extension's ID
  const files = readdirSync(extensionDir);
  const matchingDirs = files.filter((f) => !f.endsWith(".crx") && !f.endsWith(".zip")).filter((f) => f.startsWith(id));

  if (matchingDirs.length === 0) {
    throw new Error(`No unpacked extension found with ID ${id}. Make sure you've downloaded and extracted extensions.`);
  }

  // If a specific version is requested
  if (version) {
    const specificVersionDir = matchingDirs.find((f) => f.includes(version));
    if (!specificVersionDir) {
      throw new Error(`Version ${version} not found for extension with ID ${id}.`);
    }
    return join(extensionDir, specificVersionDir);
  }

  // Otherwise, return the latest version directory
  const latest = matchingDirs.sort((a, b) => {
    const vA = a.split("_")[1];
    const vB = b.split("_")[1];
    // Compare descending based on version
    return -vA.localeCompare(vB, undefined, { numeric: true });
  })[0];

  return join(extensionDir, latest);
}
