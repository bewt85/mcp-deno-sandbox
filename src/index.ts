#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { runDenoScript } from './runDeno';
import { runPythonScript } from './runPython';

// Get the permissions from the command line arguments
const permissionArgs = process.argv.slice(2);
const permissionsText =
permissionArgs.length > 0
  ? `Current Deno Permissions:\n${permissionArgs.join('\n')}`
  : 'No permissions currently enabled. Code will run in a very restricted sandbox.';

// Create an MCP server using the higher-level McpServer class
const server = new McpServer({
  name: 'DenoSandbox',
  version: '1.0.0',
});

// Add a resource for Deno permissions
server.resource('deno-permissions', 'permissions://deno', async (uri) => {
  return {
    contents: [
      {
        uri: uri.href,
        text: `${permissionsText}

Deno supports the following additional permissions but these need to be configured before the server is started:
--allow-read[=<PATH>...] or -R[=<PATH>...]
--deny-read[=<PATH>...]
--allow-write[=<PATH>...] or -W[=<PATH>...]
--deny-write[=<PATH>...]
--allow-net[=<IP_OR_HOSTNAME>...] or -N[=<IP_OR_HOSTNAME>...]
--deny-net[=<IP_OR_HOSTNAME>...]
--allow-imports[=<HOSTNAME>...]
--allow-env[=<VARIABLE_NAME>...] or -E[=<VARIABLE_NAME>...]
--deny-env[=<VARIABLE_NAME>...]`,
      },
    ],
  };
});

// Add runTypescript tool
server.tool(
  'runTypescript',
  {
    code: z.string().describe('TypeScript code to execute in the Deno sandbox'),
  },
  async ({ code }) => {
    try {
      const output = await runDenoScript(code, permissionArgs);
      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Add runPython tool
server.tool(
  'runPython',
  {
    code: z.string().describe('Python code to execute in the sandbox'),
  },
  async ({ code }) => {
    try {
      const output = await runPythonScript(code, permissionArgs);
      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Start the server with stdio transport
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error(`Unhandled Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
