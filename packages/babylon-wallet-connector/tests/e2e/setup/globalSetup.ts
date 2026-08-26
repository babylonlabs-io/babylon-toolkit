import { downloadAllExtensions } from "./downloadExtensions";

async function globalSetup() {
  await downloadAllExtensions();
}

export default globalSetup;
