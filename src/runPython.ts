import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { DEFAULT_LOGGER, formatError, Logger } from './runDeno';

// Promisify execFile
const execFileAsync = promisify(execFile);

// Set umask at the top level to ensure files are only accessible by the runner
process.umask(0o077);

/**
 * Executes a Python script string with specified permissions
 * @param scriptCode String containing the script code to run
 * @param permissions Array of permission flags to pass to Deno sanbox
 * @returns Promise that resolves with the script output or rejects with an error
 */
export async function runPythonScript(scriptCode: string, permissions: string[], logger: Logger = DEFAULT_LOGGER): Promise<string> {
  // Create temporary directory
  let tempDir = '';

  try {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deno-sandbox-'));
    
    // Write the script to a file
    const scriptPath = path.join(tempDir, 'script.py');
    await fs.writeFile(scriptPath, scriptCode, { mode: 0o600 }); // Only owner can read/write

    const importPermissions = [`--allow-read=${tempDir}`, `--allow-write=${tempDir}/node_modules/`, `--allow-net=cdn.jsdelivr.net`]
    const importScript = `
    import pyodideModule from "npm:pyodide/pyodide.js";
    const pyodide = await pyodideModule.loadPyodide();
    const decoder = new TextDecoder("utf-8");
    const scriptBytes = await Deno.readFile("script.py");
    const scriptContent = decoder.decode(scriptBytes);
    await pyodide.loadPackagesFromImports(scriptContent, { messageCallback: console.error, errorCallback: console.error });
    `
    const pythonImportScriptPath = path.join(tempDir, '.pythonImportScriptPath.ts');
    await fs.writeFile(pythonImportScriptPath, importScript, { mode: 0o600 }); // Only owner can read/write

    // Execute the script file with Deno
    const response = await execFileAsync(
      'deno',
      ['run', '--node-modules-dir=auto', ...importPermissions, pythonImportScriptPath],
      {
        cwd: tempDir,
      }
    );
    logger.error({ pythonImportScriptPath, stderr: response.stderr, stdout: response.stdout });

    // Add temporary directory read permission
    const extraPermissions = [`--allow-read=${tempDir}`]
    const allPermissions = [...permissions, ...extraPermissions];

    // Write the deno wrapper script to a file
    const pythonExecuteScriptPath = path.join(tempDir, '.pythonExecuteScriptPath.ts');
    const denoScript = `
    import pyodideModule from "npm:pyodide/pyodide.js";
    const pyodide = await pyodideModule.loadPyodide();
    const decoder = new TextDecoder("utf-8");
    const scriptBytes = await Deno.readFile("script.py");
    const scriptContent = decoder.decode(scriptBytes);
    await pyodide.loadPackagesFromImports(scriptContent, { checkIntegrity: false, messageCallback: console.error, errorCallback: console.error });
    await pyodide.runPythonAsync(scriptContent);
    `
    await fs.writeFile(pythonExecuteScriptPath, denoScript, { mode: 0o600 }); // Only owner can read/write

    // Execute the script file with Deno
    const { stdout, stderr } = await execFileAsync(
      'deno',
      ['run', '--node-modules-dir=auto', ...allPermissions, pythonExecuteScriptPath],
      {
        cwd: tempDir,
      }
    );
    logger.error({ pythonExecuteScriptPath, stderr, stdout });

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
