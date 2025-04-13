import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Executes a Deno script with specified permissions
 * @param script Path to the script to run
 * @param permissions Array of permission flags for Deno
 * @returns Result of script execution
 */
async function runScript(script: string, permissions: string[] = []) {
  try {
    const permissionFlags = permissions.map(p => `--${p}`).join(' ');
    const command = `deno run ${permissionFlags} ${script}`;
    
    console.log(`Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) {
      console.error("Error output:", stderr);
    }
    
    return stdout;
  } catch (error) {
    console.error("Failed to execute Deno script:", error);
    throw error;
  }
}

/**
 * Main function to parse arguments and run the script
 */
async function main() {
  const args = process.argv.slice(2); // Remove 'node' and script name
  
  if (args.length === 0) {
    console.error("Error: No script specified");
    console.log("Usage: npm start -- <script.ts> [permissions]");
    console.log("Available permissions:");
    console.log("  allow-read    - Allow file system read access");
    console.log("  allow-write   - Allow file system write access");
    console.log("  allow-net     - Allow network access");
    console.log("  allow-env     - Allow environment access");
    console.log("  allow-run     - Allow running subprocesses");
    console.log("  deny-read     - Deny file system read access to specific paths");
    console.log("  deny-write    - Deny file system write access to specific paths");
    console.log("  deny-net      - Deny network access to specific domains");
    console.log("  deny-env      - Deny access to specific environment variables");
    console.log("  deny-run      - Deny running specific subprocesses");
    console.log("Examples:");
    console.log("  npm start -- script.ts allow-net allow-read");
    console.log("  npm start -- script.ts allow-net=example.com deny-net=evil.com");
    process.exit(1);
  }
  
  const scriptPath = args[0];
  const supportedPermissions = [
    'allow-read', 'allow-write', 'allow-net', 'allow-env', 'allow-run',
    'deny-read', 'deny-write', 'deny-net', 'deny-env', 'deny-run'
  ];
  
  // Filter valid permission args
  const permissions = args.slice(1).filter(arg => {
    // Check if the arg starts with any supported permission
    return supportedPermissions.some(perm => 
      arg === perm || arg.startsWith(`${perm}=`)
    );
  });
  
  try {
    console.log(`Running Deno script: ${scriptPath}`);
    const result = await runScript(scriptPath, permissions);
    console.log("Script output:");
    console.log(result);
  } catch (error) {
    console.error("Script execution failed");
    process.exit(1);
  }
}

// Run the application
main().catch(error => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
