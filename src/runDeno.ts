import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Promisify execFile
const execFileAsync = promisify(execFile);

// Set umask at the top level to ensure files are only accessible by the runner
process.umask(0o077);

/**
 * Formats error messages from Deno, providing clearer information for permission errors
 * @param error The error object or string to format
 * @returns A formatted error message
 */
function formatError(error: Error | string): string {
  let errorMessage: string = error instanceof Error ? error.message : String(error);
      
  // Check if it's a permission error
  if (errorMessage.includes("NotCapable")) {
    // Extract the core error message, removing stack traces and extra context
    const permissionMatch = errorMessage.match(/NotCapable: ([^\n]+)/);
    if (permissionMatch) {
      const requiredPermission = permissionMatch[1];
      
      // Extract the specific flag needed from the error message
      // This improved regex captures both basic flags (--allow-read) 
      // and flags with path arguments (--allow-read=/path/to/file)
      const flagMatch = requiredPermission.match(/(--allow-[a-z]+(?:=[^\s]+)?)/);
      
      // If we have a specific flag, use it; otherwise provide a general message
      const permissionFlag = flagMatch ? flagMatch[1] : "specific permissions";
      
      // For flags with path arguments, provide more specific guidance
      let additionalInfo = "";
      if (permissionFlag.includes("=")) {
        // Extract the base permission type for clarity
        const basePermission = permissionFlag.split("=")[0];
        additionalInfo = `\nNote: You need access to a specific path. Either grant access to this exact path or use ${basePermission} without a path argument to grant broader access.`;
      }
      
      return `The MCP server does not have sufficient permissions to run this code. 
Required permission: ${requiredPermission}
The server needs to be restarted with ${permissionFlag} to run this code.${additionalInfo}`;
    }
  } else if (errorMessage.includes("Deno process exited with code")) {
    // For syntax errors or runtime errors, extract the main error message
    const syntaxMatch = errorMessage.match(/error: ([^\n]+)/);
    if (syntaxMatch) {
      return syntaxMatch[1];
    }
  }
  
  return errorMessage;
}

/**
 * Executes a Deno script string with specified permissions
 * @param scriptCode String containing the script code to run
 * @param permissions Array of permission flags to pass to Deno
 * @returns Promise that resolves with the script output or rejects with an error
 */
export async function runDenoScript(scriptCode: string, permissions: string[]): Promise<string> {  
  // Create temporary directory
  let tempDir = '';
    
  try {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deno-sandbox-'));
    
    // Create deno.json configuration file
    const denoConfigPath = path.join(tempDir, 'deno.json');
    await fs.writeFile(denoConfigPath, JSON.stringify({
      nodeModulesDir: "auto"
    }, null, 4), { mode: 0o600 }); // Only owner can read/write
    
    // Write the script to a file
    const scriptPath = path.join(tempDir, 'script.ts');
    await fs.writeFile(scriptPath, scriptCode, { mode: 0o600 }); // Only owner can read/write
    
    // Add temporary directory read permission
    const allPermissions = [...permissions, `--allow-read=${tempDir}`];
    
    // Execute the script file with Deno
    const { stdout } = await execFileAsync('deno', ['run', '--config', denoConfigPath, ...allPermissions, scriptPath], {
      cwd: tempDir
    });
    
    return stdout;
  } catch (error) {
    // Handle and wrap error
    const errorMessage = formatError(error as (Error | string));
    throw new Error(`Error running Deno script: ${errorMessage}`);
  } finally {
    // Clean up the temporary directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(`Failed to remove temporary directory: ${tempDir}`);
      }
    }
  }
}