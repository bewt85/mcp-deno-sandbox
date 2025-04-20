#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { runDenoScript } from './runDeno';
import { runPythonScript } from './runPython';

// Create an MCP server
const server = new Server(
  {
    name: 'DenoSandbox',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// Get the permissions from the command line arguments
const permissionArgs = process.argv.slice(2);

// Handle resource listing
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'permissions://deno',
        name: 'Deno Permissions',
        description: 'List of Deno permissions available to the TypeScript and Python sandboxes',
      },
    ],
  };
});

// Handle resource reading
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === 'permissions://deno') {
    let permissionsText =
      permissionArgs.length > 0
        ? `Current Deno Permissions:\n${permissionArgs.join('\n')}`
        : 'No permissions currently enabled. Code will run in a very restricted sandbox.';

    return {
      contents: [
        {
          uri: 'permissions://deno',
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
--deny-env[=<VARIABLE_NAME>...]`,
        },
      ],
    };
  }

  throw new Error(`Resource not found: ${request.params.uri}`);
});

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'runTypescript',
        description:
          'Runs TypeScript code in a Deno sandbox with the permissions specified when starting the server.',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'TypeScript code to execute in the Deno sandbox',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'runPython',
        description:
          'Runs Python code in a Deno-based Pyodide sandbox with the permissions specified when starting the server.',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Python code to execute in the sandbox',
            },
          },
          required: ['code'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'runTypescript') {
    try {
      const code = request.params.arguments!.code as string;
      const output = await runDenoScript(code, permissionArgs);

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
        isError: false,
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
  } else if (request.params.name === 'runPython') {
    try {
      const code = request.params.arguments!.code as string;
      const output = await runPythonScript(code, permissionArgs);

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
        isError: false,
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

  throw new Error(`Tool not found: ${request.params.name}`);
});

// Start the server with stdio transport
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.log(`Unhandled Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});