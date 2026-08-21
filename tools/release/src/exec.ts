import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';

export const execCommand = async (
  cmd: string,
  args: string[],
  options?: SpawnOptionsWithoutStdio
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...options,
      stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
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
          new Error(
            stderr ||
              `Unknown error occurred while running "${cmd} ${args.join(' ')}"`
          )
        );
      } else {
        resolve(stdout);
      }
    });
  });
};
