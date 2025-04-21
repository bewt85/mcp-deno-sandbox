import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DEFAULT_LOGGER, formatError, Logger } from './logging';

// Promisify execFile
const execFileAsync = promisify(execFile);

// Set umask at the top level to ensure files are only accessible by the runner
process.umask(0o077);

/**
 * Executes a Deno script string with specified permissions
 * @param scriptCode String containing the script code to run
 * @param permissions Array of permission flags to pass to Deno
 * @returns Promise that resolves with the script output or rejects with an error
 */
export async function runDenoScript(
  scriptCode: string,
  permissions: string[],
  logger: Logger = DEFAULT_LOGGER
): Promise<string> {
  // Create temporary directory
  let tempDir = '';

  try {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deno-sandbox-'));

    // Write the script to a file
    const scriptPath = path.join(tempDir, 'script.ts');
    await fs.writeFile(scriptPath, scriptCode, { mode: 0o600 }); // Only owner can read/write

    // Execute the script file with Deno
    const { stdout } = await execFileAsync(
      'deno',
      [
        'run',
        '--node-modules-dir=auto', // Creates a new node_modules in tempDir into which dependencies are installed
        `--allow-read=${tempDir}`, // So the script can be found
        ...permissions,
        scriptPath,
      ],
      {
        cwd: tempDir,
      }
    );

    return stdout;
  } catch (error) {
    // Handle and wrap error
    const errorMessage = formatError(error as Error | string);
    throw new Error(`Error running Deno script: ${errorMessage}`);
  } finally {
    // Clean up the temporary directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.error(`Failed to remove temporary directory: ${tempDir}`);
      }
    }
  }
}
