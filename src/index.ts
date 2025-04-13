import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function showDenoVersion() {
  try {
    const { stdout, stderr } = await execAsync("deno --version");

    if (stderr) {
      console.error("deno stderr:", stderr);
    }
    console.log("deno version:\n", stdout);
  } catch (error) {
    console.error("Error executing deno:", error);
  }
}

showDenoVersion();
