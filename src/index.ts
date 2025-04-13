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
  const args = process.argv.slice(2); // Remove 'node' and script name
  
  if (args.length === 0) {
    console.error("Error: No script specified");
    console.log("Usage: npm start -- \"<script code>\" [permission flags]");
    console.log("Example permissions:");
    console.log("  --allow-read            Allow file system read access");
    console.log("  --allow-write           Allow file system write access");
    console.log("  --allow-net             Allow network access");
    console.log("  --allow-env             Allow environment access");
    console.log("  --allow-run             Allow running subprocesses");
    console.log("  --allow-read=/path      Allow read access to specific path");
    console.log("  --deny-read=/path       Deny read access to specific path");
    console.log("Examples:");
    console.log("  npm start -- \"console.log('Hello')\" --allow-net --allow-read");
    console.log("  npm start -- \"Deno.readTextFile('./file.txt')\" --allow-read=./file.txt");
    process.exit(1);
  }
  
  const scriptCode = args[0];
  
  // Extract permission flags (all arguments starting with --)
  const permissions = args.slice(1).filter(arg => arg.startsWith('--'));
  
  try {
    await runScript(scriptCode, permissions);
  } catch (error) {
    console.error("Script execution failed:", error);
    process.exit(1);
  }
}

// Run the application
main().catch(error => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
