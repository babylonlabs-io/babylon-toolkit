import { spawn } from 'node:child_process';
import { releaseChangelog, releasePublish, releaseVersion } from 'nx/release';

const release = async () => {
  const { workspaceVersion, projectsVersionData } = await releaseVersion({
    gitCommit: false,
    gitTag: true,
    verbose: true,
  });

  const projectHasNewVersion = Object.entries(projectsVersionData).filter(
    ([_, project]) => project.newVersion !== null
  );

  if (projectHasNewVersion.length === 0) {
    console.log('No project release needed');
    process.exit(0);
  }

  await releaseChangelog({
    versionData: projectsVersionData,
    version: workspaceVersion,
    gitCommit: false,
    gitTag: false,
    verbose: true,
  });

  /**
   * We intentionally not commit all the version changes but only push the tags
   */
  await gitPush();

  const publishResults = await releasePublish({
    verbose: true,
  });

  const allExitOk = Object.values(publishResults).every(
    (result) => result.code === 0
  );
  if (!allExitOk) {
    // When a publish target fails, we want to fail the CI
    process.exit(1);
  }
};

const gitPush = async () => {
  const commandArgs = [
    'push',
    // NOTE: It's important we use --follow-tags, and not --tags, so that we are precise about what we are pushing
    '--follow-tags',
    '--no-verify',
    '--atomic',
  ];

  console.log(
    'Pushing the current branch to the remote with the following command:'
  );
  console.log(`git ${commandArgs.join(' ')}`);

  try {
    await execCommand('git', commandArgs);
  } catch (err) {
    throw new Error(`Unexpected git push error: ${err}`);
  }
};

const execCommand = async (
  cmd: string,
  args: string[],
  options?: any
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...options,
      stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
      encoding: 'utf-8',
      windowsHide: false,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          stderr ||
            `Unknown error occurred while running "${cmd} ${args.join(' ')}"`
        );
      } else {
        resolve(stdout);
      }
    });
  });
};

release();
