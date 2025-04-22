# Deno Sandbox MCP Server

An MCP server that allows you to run TypeScript, JavaScript, and Python code securely on your local machine using the Deno® sandbox. This server provides a controlled environment for executing code with explicit permission controls.

> **Note:** This project is not affiliated with Deno Land LLC in any way. I'm just a fan of the Deno® runtime. "Deno" is a registered trademark of Deno Land LLC.

![Screenshot of a cowsay cow saying hello](./docs/cowsay.png)

## How and why

LLMs are great at writing cods and it can be useful if they can run and test it with limited human input. The problem is that they cannot be trusted not to do damage, especially if a malicious human can trick the LLM using prompt injection. For example you innocently ask a LLM to summarise an email and someone wrote you an email telling your LLM to run code to delete all your files and send all your bitcoin to them.

A sandbox enforces limitations on what the code written by your LLM can do. For example we might say it can only change files in a specific folder, or contact specific trusted websites.

Each operating system has different ways of creating sandboxes. Some are more secure, some are easier to setup. This project strikes a balance between the two.

Our sandbox uses Deno which in turn uses the same technology Chrome uses to stop malicious websites damaging your computer. This lets you run Typescript and Javascript and relies on [very little of my code](./src/runDeno.ts).

Some hard working people have also made Pyodide which lets you run Python inside a web browser. We use that to [let you run Python](./src/runPython.ts) inside the same Deno environment.

You control permissions by passing arguments which are given directly to the Deno runtime.

## Features

- Restricted runtime environment for TypeScript, JavaScript, and Python code
  - Controlled read / write filesystem access
  - Controlled access to the network (by IP or domain)
  - Controlled access to environment variables and other sensitive data
- Uses Pyodide to support Python in the same Deno sandbox

## Non Features

I would like to keep this codebase simpler to read than alternative so people can audit it themselves.  I will avoid adding features which make the code harder to read.

I have also chosen to sacrifice some performance by not reusing pyodide environments.  This creates a small overhead but it makes the implementation easier to reason about.

## Inspiration

* Simon Willison's [Pyodide sandboxing experiments](https://til.simonwillison.net/deno/pyodide-sandbox)
* Pydantics's [MCP Run Python](https://github.com/pydantic/pydantic-ai/tree/main/mcp-run-python)

## Usage with Claude Desktop

This MCP should work with a range of MCP clients.

To use this MCP server with Claude Desktop, add it to your `claude_desktop_config.json` in:

* macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
* Windows: `%APPDATA%\Claude\claude_desktop_config.json`


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

*If you have Nodejs installed* then Deno will be installed automatically
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

You can help your LLM by encouraging it to use these tools.  There is also a resource which defines the permissions available in the sandbox.

### Permission Examples

You need to set the permissions at runtime; if you change them you need to restart the server.

The permissions are the same as the [Deno® permissions](https://docs.deno.com/runtime/fundamentals/security/) and are just passed through.

*Examples*

1. **Network Access**
   - Permissive: `--allow-net`
     - Allows all network access
   - Restricted: `--allow-net=api.github.com,example.com`
     - Allows network access only to specific domains

2. **File System**
   - Permissive: `--allow-read --allow-write`
     - Full file system access
     - Tradeoff: Rogue LLMs can access your dotfiles and anything else you can (including the file it can edit to give itself more permissions)
   - Restricted: `--allow-read=/tmp --allow-write=/tmp`
     - Limited to specific directories
     - Good for processing isolated files

For a complete list of permissions and detailed documentation, see [Deno® Security](https://docs.deno.com/runtime/fundamentals/security/).

## Security Considerations

This server runs code using the permissions specified when starting the server. These permissions are passed through to the Deno® runtime.

Be careful about what permissions you enable.  The sandbox is completely undermined by:
* giving blanket FFI or execution permissions
* allowing write access to the file which manages the server permissions (e.g. `claude_desktop_config.json`)

You should also think carefully about read permissions to sensitive `dotfiles` you have (e.g. with credentials for AWS, NPM, OpenAI); especially if you have granted network access.

Remember malicious people can use prompt injection to trick your prefered language model into running bad things on your computer.  Maybe they can hide some invisible text in a PDF which you cannot read or in the middle of a long document you ask it to summarise.

Deno® has some [additional suggestions](https://docs.deno.com/runtime/fundamentals/security/#executing-untrusted-code) if you would like even more isolation for untrusted code.

## Known Issues

### Python

* you cannot use `open(PATH, 'w')` to write files for some reason. It works for reading files, I don't know what writing doesn't work.  I included a hint how to
  get around this in the tool description.  You can also point out to your LLM that it can run `import js; js.fs.writeFileSync(PATH, CONTENT)`. This runs in the same Deno sanbox but is a little bit more annoying.
* If you give `-A`, `-R`, or `-W` permissions, it is hard to tell which files should be mounted into the pyodide environment.  For now, I just guess your home
  directory and `/tmp`.  You can also specify other directories explicitly and these will be mounted.
* I am not sure if this mounting will work correctly on Windows.

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
npx @modelcontextprotocol/inspector ./node_modules/.bin/ts-node src/index.ts
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

## Contributing

I don't have a lot of spare time so I will not be able to engage with most feature requests / contributions.  It is probably better to fork the repository if you would like to add something. Apologies. 

## Releases

When you want to do a release:
* update the version in `package.json` to X.Y.Z
* merge your changes
* make a release in GitHub vX.Y.Z
* wait for it to be automatically deployed to NPM


## License

MIT
