// scripts/build-proto.js
const shell = require("shelljs");

const BABYLON_REPO_URL = "https://github.com/babylonlabs-io/babylon.git";
const BABYLON_REPO_DIR = "babylon";
const PROTO_DIR = "proto";

const BABYLON_REPO_TAG = "v3.0.0-snapshot.250717";

const generateProto = async () => {
  try {
    // Clone the Babylon repository
    console.log("Cloning the Babylon repository...");
    shell.exec(
      `git clone --depth 1 --branch ${BABYLON_REPO_TAG} ${BABYLON_REPO_URL} ${BABYLON_REPO_DIR}`,
    );

    // Copy the proto files
    console.log("Copying proto files...");
    shell.mkdir("-p", PROTO_DIR);
    shell.cp("-R", `${BABYLON_REPO_DIR}/proto/*`, PROTO_DIR);

    // Generate TypeScript code using buf
    console.log("Generating TypeScript code...");
    shell.exec("npx buf generate proto");

    // Clean up
    console.log("Cleaning up...");
    shell.rm("-rf", PROTO_DIR);
    shell.rm("-rf", BABYLON_REPO_DIR);

    console.log("Build completed successfully.");
  } catch (error) {
    console.error("Error during build:", error);
    process.exit(1);
  }
};

generateProto();
