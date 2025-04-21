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

function parseReadablePaths(permissions: string[]): string[] {
  const readablePaths = new Set<string>();

  const filePermissionArguments = ["-R", "--allow-read", "-W", "--allow-write"]

  for (const permission of permissions) {
    // Check if this is a full read permission
    if (filePermissionArguments.includes(permission)) {
      // Add user's home directory and temp directory for full access
      readablePaths.add(os.homedir());
      readablePaths.add(os.tmpdir());
      continue;
    }

    for (const p of filePermissionArguments) {
      const argumentPrefix = `${p}=`;
      // e.g. '--allow-read='
      if (permission.startsWith(argumentPrefix)) {
        const paths = permission.substring(argumentPrefix.length).split(",");
        for (const path_str of paths) {
          if (path_str) {
            // Convert to absolute path if it's not already
            const absolutePath = path.isAbsolute(path_str) ? path_str : path.resolve(path_str);
            readablePaths.add(absolutePath);
          }
        }
        continue;
      }
    }
  }

  // Convert Set to array
  return Array.from(readablePaths);
}

function isChild(a: string, b: string): boolean {
  // Assuming all paths are absolute already
  // Remove the trailing separator
  const aNorm = a.endsWith(path.sep) ? a.slice(0, a.length - 1) : a;
  const bNorm = b.endsWith(path.sep) ? b.slice(0, b.length - 1) : b;
  
  if (a === b) return false; // handle identical paths separately
  const aPaths = aNorm.split(path.sep);
  const bPaths = bNorm.split(path.sep);
  if (aPaths.length <= bPaths.length) return false;
  
  for (let i = 0; i < bPaths.length; i++) {
    if (aPaths[i] !== bPaths[i]) return false;
  }
  return true;
}

/**
 * Removes paths that are already covered by parent directories in the list
 * @param paths Array of file or directory paths
 * @returns Filtered array with redundant paths removed
 */
function removeRedundantPaths(paths: string[]): string[] {
  const filteredPaths: string[] = [];

  // Normalize all paths for consistent comparison
  const normalizedPaths = paths.map(p => path.normalize(p));

  for (let i = 0; i < normalizedPaths.length; i++) {
    let isRedundant = false;
    const currentPath = normalizedPaths[i];

    for (let j = 0; j < normalizedPaths.length; j++) {
      if (i === j) continue;
      const otherPath = normalizedPaths[j];
      if (otherPath === currentPath) {
        if (i > j) { isRedundant = true; break; }
      } else if (isChild(currentPath, otherPath)) { isRedundant = true; break; }
    }

    if (!isRedundant) {
      filteredPaths.push(paths[i]);
    }
  }

  return filteredPaths;
}

/**
 * Executes a Python script string with specified permissions using pyodide
 * @param scriptCode String containing the script code to run
 * @param permissions Array of permission flags to pass to Deno sanbox
 * @returns Promise that resolves with the script output or rejects with an error
 */
export async function runPythonScript(
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
    const scriptPath = path.join(tempDir, 'script.py');
    await fs.writeFile(scriptPath, scriptCode, { mode: 0o600 }); // Only owner can read/write

    // Python code is run in Deno using pyodide
    // We run two separate Deno processes sequentially.
    // In the first, we installs pyodide, find the dependencies, and download them.
    // This needs some extra permissions (to write the dependencies and to fetch them from a CDN)
    // and doesn't need the user specified permissions.  We therefore don't execute the user script
    // yet; we use a second Deno process with the user specified permissions in a minute.
    const importScript = `
    import pyodideModule from "npm:pyodide/pyodide.js";  // Downloads pyodide
    const pyodide = await pyodideModule.loadPyodide();
    const decoder = new TextDecoder("utf-8");
    const scriptBytes = await Deno.readFile("script.py");
    const scriptContent = decoder.decode(scriptBytes);
    // This is the line which inspects the python script for dependencies and fetches them.
    await pyodide.loadPackagesFromImports(scriptContent, { messageCallback: console.error, errorCallback: console.error });
    `;
    const pythonImportScriptPath = path.join(tempDir, '.pythonImportScriptPath.ts');
    await fs.writeFile(pythonImportScriptPath, importScript, { mode: 0o600 }); // Only owner can read/write

    // Execute the script file with Deno
    await execFileAsync(
      'deno',
      [
        'run',
        '--node-modules-dir=auto', // Creates a new node_modules in tempDir into which pyodide and dependencies are installed
        `--allow-read=${tempDir}`, // So the python script can be found
        `--allow-write=${tempDir}/node_modules/`, // So the pyodide and dependencies can be downloaded
        `--allow-net=cdn.jsdelivr.net`, // Where the pyodide and dependencies come from
        pythonImportScriptPath,
      ],
      {
        cwd: tempDir,
      }
    );

    const mountableDirectories = removeRedundantPaths([...parseReadablePaths(permissions), tempDir]);
    const mountCommands = mountableDirectories.map(d => `await pyodide.mountNodeFS("${d}", "${d}");`).join('\n');

    // Write the deno wrapper script to a file
    const pythonExecuteScriptPath = path.join(tempDir, '.pythonExecuteScriptPath.ts');
    const denoScript = `
    import pyodideModule from "npm:pyodide/pyodide.js";
    import fs from "node:fs";
    const pyodide = await pyodideModule.loadPyodide({
      jsglobals: { fs },
    });
    const decoder = new TextDecoder("utf-8");
    const scriptBytes = await Deno.readFile("script.py");
    const scriptContent = decoder.decode(scriptBytes);
    // We need to load the dependencies again, but this time they are cached.
    // I disabled the integrity checking because we literally just installed them and we don't necessarily have web access any more.
    await pyodide.loadPackagesFromImports(scriptContent, { checkIntegrity: false, messageCallback: console.error, errorCallback: console.error });

    // Prepare the native file system
    ${mountCommands}
    const pyOs = pyodide.pyimport('os');
    pyOs.chdir("${tempDir}");

    // Run the script
    await pyodide.runPythonAsync(scriptContent);
    `;
    await fs.writeFile(pythonExecuteScriptPath, denoScript, { mode: 0o600 }); // Only owner can read/write

    // Execute the script file with Deno
    const { stdout } = await execFileAsync(
      'deno',
      [
        'run',
        '--node-modules-dir=auto', // Creates a new node_modules in tempDir into which pyodide and dependencies are installed
        '--v8-flags=--experimental-wasm-stack-switching', // We need this feature so that urllib / requests work
        `--allow-read=${tempDir}`, // So the python script and dependencies can be loaded without adding network access
        ...permissions, // The user specified permissions
        pythonExecuteScriptPath,
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
