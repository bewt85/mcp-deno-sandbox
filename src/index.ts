import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";

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
 * @returns Promise that resolves with the script output or rejects with an error
 */
function runScript(scriptCode: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Spawn deno process with permissions
    const deno = spawn("deno", ["run", ...permissionArgs, "-"], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    // Collect stdout
    deno.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    // Collect stderr
    deno.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Handle process completion
    deno.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Deno process exited with code ${code}: ${stderr}`));
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
      const output = await runScript(code);
      
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
      let errorMessage = (error as Error).message;
      
      // Check if it's a permission error
      if (errorMessage.includes("NotCapable")) {
        // Extract the core error message, removing stack traces and extra context
        const permissionMatch = errorMessage.match(/NotCapable: ([^\n]+)/);
        if (permissionMatch) {
          errorMessage = permissionMatch[1];
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
server.connect(transport).catch(error => { console.log(`Unhandled Error: ${error}`); process.exit(1) });
