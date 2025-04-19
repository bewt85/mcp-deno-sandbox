#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Promisify execFile
const execFileAsync = promisify(execFile);

// Set umask at the top level to ensure files are only accessible by the runner
process.umask(0o077);

// Create an MCP server
const server = new Server(
  {
    name: "DenoSandbox",
    version: "1.0.0"
  },
  {
    capabilities: {
      resources: {},
      tools: {}
    }
  }
);

// Get the permissions from the command line arguments
const permissionArgs = process.argv.slice(2);

// Handle resource listing
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "permissions://deno",
        name: "Deno Permissions",
        description: "List of Deno permissions available to the TypeScript sandbox"
      }
    ]
  };
});

// Handle resource reading
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "permissions://deno") {
    let permissionsText = permissionArgs.length > 0 
      ? `Current Deno Permissions:\n${permissionArgs.join('\n')}`
      : "No permissions currently enabled. Code will run in a very restricted sandbox.";
    
    return {
      contents: [
        {
          uri: "permissions://deno",
          text: `${permissionsText}

Supported Deno permissions:
--allow-read[=<PATH>...] or -R[=<PATH>...]
--deny-read[=<PATH>...]
--allow-write[=<PATH>...] or -W[=<PATH>...]
--deny-write[=<PATH>...]
--allow-net[=<IP_OR_HOSTNAME>...] or -N[=<IP_OR_HOSTNAME>...]
--deny-net[=<IP_OR_HOSTNAME>...]
--allow-imports[=<HOSTNAME>...]
--allow-env[=<VARIABLE_NAME>...] or -E[=<VARIABLE_NAME>...]
--deny-env[=<VARIABLE_NAME>...]`
        }
      ]
    };
  }
  
  throw new Error(`Resource not found: ${request.params.uri}`);
});

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
    const errorMessage = error instanceof Error ? error.message : String(error);
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

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "runTypescript",
        description: "Runs TypeScript code in a Deno sandbox with the permissions specified when starting the server.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "TypeScript code to execute in the Deno sandbox"
            }
          },
          required: ["code"]
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "runTypescript") {
    try {
      const code = request.params.arguments!.code as string;
      const output = await runDenoScript(code, permissionArgs);
      
      return {
        content: [
          {
            type: "text",
            text: output
          }
        ],
        isError: false
      };
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if it's a permission error
      if (errorMessage.includes("NotCapable")) {
        // Extract the core error message, removing stack traces and extra context
        const permissionMatch = errorMessage.match(/NotCapable: ([^\n]+)/);
        if (permissionMatch) {
          const requiredPermission = permissionMatch[1];
          
          // Extract the specific flag needed from the error message
          const flagMatch = requiredPermission.match(/--allow-[a-z]+/);
          const permissionFlag = flagMatch ? flagMatch[0] : "specific permissions";
          
          errorMessage = `The MCP server does not have sufficient permissions to run this code. 
Required permission: ${requiredPermission}
The server needs to be restarted with ${permissionFlag} to run this code.`;
        }
      } else if (errorMessage.includes("Deno process exited with code")) {
        // For syntax errors or runtime errors, extract the main error message
        const syntaxMatch = errorMessage.match(/error: ([^\n]+)/);
        if (syntaxMatch) {
          errorMessage = syntaxMatch[1];
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
  
  throw new Error(`Tool not found: ${request.params.name}`);
});

// Start the server with stdio transport
const transport = new StdioServerTransport();
server.connect(transport).catch(error => { 
  console.log(`Unhandled Error: ${error instanceof Error ? error.message : String(error)}`); 
  process.exit(1);
});