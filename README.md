# Deno Sandbox MCP Server

An MCP server that allows you to run TypeScript and JavaScript code securely on your local machine using the Deno® sandbox. This server provides a controlled environment for executing code with explicit permission controls.

> **Note:** This project is not affiliated with Deno Land LLC in any way. I'm just a fan of the Deno® runtime. "Deno" is a registered trademark of Deno Land LLC.

## Features

- Execute TypeScript/JavaScript code in a secure Deno® sandbox
- Granular permission control via command-line flags
- Clear error messages for permission issues
- Resource that lists available permissions

## Usage with Claude Desktop

To use this MCP server with Claude Desktop, add it to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "denoSandbox": {
      "command": "node",
      "args": [
        "/absolute/path/to/deno-mcp/dist/index.js",
        "--allow-net=icanhazip.com"
      ]
    }
  }
}
```

### Permission Examples and Tradeoffs

1. **Network Access**
   - Permissive: `--allow-net`
     - Allows all network access
     - Useful for web scraping, API calls
     - Tradeoff: Code can access any website or API
   - Restricted: `--allow-net=api.github.com,example.com`
     - Allows network access only to specific domains
     - Safer while still enabling useful functionality
     - Tradeoff: Must know domains in advance

2. **File System**
   - Permissive: `--allow-read --allow-write`
     - Full file system access
     - Useful for data processing applications
     - Tradeoff: High security risk, can read/modify any files
   - Restricted: `--allow-read=/tmp --allow-write=/tmp`
     - Limited to specific directories
     - Good for processing isolated files
     - Tradeoff: Limited functionality, but much safer

For a complete list of permissions and detailed documentation, see [Deno® Security](https://docs.deno.com/runtime/fundamentals/security/).

## Security Considerations

This server runs code with precisely the permissions specified when starting the server. No additional permissions will be granted at runtime.

Remember that any code executed has access to the permissions you've provided, so be careful about what permissions you enable.  Remember malicious people can use prompt injection to trick your prefered language model into running bad things on your computer.

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/deno-mcp.git
cd deno-mcp

# Install dependencies
npm install
```

## Development

Build the TypeScript code:

```bash
npm run build
```

Test with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js --allow-net
```

### Example Tests

Try these examples in the inspector:

1. Basic arithmetic (works without permissions):
   ```typescript
   console.log(1 + 2);
   ```

2. Network access (requires `--allow-net`):
   ```typescript
   fetch('https://icanhazip.com').then(response => response.text()).then(ip => console.log(`Your IP is: ${ip.trim()}`));
   ```

3. File system access (requires `--allow-read`):
   ```typescript
   const text = Deno.readTextFileSync('/path/to/file.txt');
   console.log(text);
   ```

## License

MIT
