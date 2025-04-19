# Deno Sandbox MCP Server

## Don't use me yet: WIP

An MCP server that allows you to run TypeScript and JavaScript code securely on your local machine using the Deno® sandbox. This server provides a controlled environment for executing code with explicit permission controls.

> **Note:** This project is not affiliated with Deno Land LLC in any way. I'm just a fan of the Deno® runtime. "Deno" is a registered trademark of Deno Land LLC.

## Features

- Execute TypeScript/JavaScript code in a secure Deno® sandbox
- Granular permission control via command-line flags
- Clear error messages for permission issues
- Resource that lists available permissions

## Usage with Claude Desktop

To use this MCP server with Claude Desktop, add it to your `claude_desktop_config.json`:

*If you have Deno installed*
```json
{
  "mcpServers": {
    "denoSandbox": {
      "command": "deno",
      "args": [
        "run",
        "npm:mcp-deno-sandbox",
        "--allow-net=icanhazip.com"
      ]
    }
  }
}
```

*If you have Nodejs installed*
```json
{
  "mcpServers": {
    "denoSandbox": {
      "command": "npx",
      "args": [
        "mcp-deno-sandbox",
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

This server runs code using the permissions specified when starting the server. These permissions are passed through to the Deno® runtime.

Remember that any code executed has access to the permissions you've provided, so be careful about what permissions you enable.  

The sandbox is completely undermined by:
* giving blanket FFI or execution permissions
* allowing write access to the file which manages the server permissions (e.g. `claude_desktop_config.json`)

You should also think carefully about read permissions to sensitive `dotfiles` you have (e.g. with credentials for AWS, NPM, OpenAI); especially if you have granted network access.

Remember malicious people can use prompt injection to trick your prefered language model into running bad things on your computer.  Maybe they can hide some invisible text in a PDF which you cannot read or in the middle of a long document you ask it to summarise.

Deno® has some [additional suggestions](https://docs.deno.com/runtime/fundamentals/security/#executing-untrusted-code) if you would like even more isolation for untrusted code.

## Development

```bash
# Clone the repository
git clone https://github.com/bewt85/mcp-deno-sandbox.git
cd mcp-deno-sandbox

# Install dependencies
npm install
```

Check the code formatting and types:

```bash
npm run checks
```

Fix some issues automatically:

```bash
npm run fix
```

Test with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx mcp-deno-sandbox --allow-net
```

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

## Releases

When you want to do a release:
* update the version in `package.json` to X.Y.Z
* merge your changes
* make a release in GitHub vX.Y.Z
* wait for it to be automatically deployed to NPM


## License

MIT
