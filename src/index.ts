import { spawn } from "child_process";

/**
 * Executes a Deno script string with specified permissions
 * @param scriptCode String containing the script code to run
 * @param permissions Array of permission flags for Deno
 * @returns Promise that resolves when the script completes successfully
 */
function runScript(scriptCode: string, permissions: string[] = []) {
  return new Promise((resolve, reject) => {
    // Format permission flags exactly as Deno expects them
    const args = [...permissions, "-"];
    
    // Spawn deno process with permissions
    const deno = spawn("deno", ["run", ...args], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Pipe stdout directly to process.stdout
    deno.stdout.pipe(process.stdout);
    
    // Pipe stderr directly to process.stderr
    deno.stderr.pipe(process.stderr);
    
    // Handle process completion
    deno.on('close', (code) => {
      if (code === 0) {
        resolve("Script executed successfully");
      } else {
        reject(new Error(`Deno process exited with code ${code}`));
      }
    });
    
    // Handle process errors
    deno.on('error', (err) => {
      reject(new Error(`Failed to start Deno process: ${err.message}`));
    });
    
    // Send script code to stdin and close the stream
    deno.stdin.write(scriptCode);
    deno.stdin.end();
  });
}

/**
 * Main function to parse arguments and run the script
 */
async function main() {
    // Supported permissions:
    //   --allow-read[=<PATH>...] or -R[=<PATH>...]
    //   --deny-read[=<PATH>...]
    //   --allow-write[=<PATH>...] or -W[=<PATH>...]
    //   --deny-write[=<PATH>...]
    //   --allow-net[=<IP_OR_HOSTNAME>...] or -N[=<IP_OR_HOSTNAME>...]
    //   --deny-net[=<IP_OR_HOSTNAME>...]
    //   --allow-imports[=<HOSTNAME>...]
    //   --allow-env[=<VARIABLE_NAME>...] or -E[=<VARIABLE_NAME>...]
    //   --deny-env[=<VARIABLE_NAME>...]

    const argList = process.argv.slice(3);
    const script = process.argv[2]

    try {
        await runScript(script, argList);
    } catch (error) {
        console.error("Script execution failed:", (error as Error).message);
        process.exit(1);
    }
}

// Run the application
main().catch(error => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
