import { runDenoScript } from '../runDeno';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Deno Sandbox Integration Tests', () => {
  let tempDir: string;
  let testFilePath: string;
  let secretFilePath: string;

  // Create test files and directories before tests
  beforeAll(async () => {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deno-sandbox-test-'));
    testFilePath = path.join(tempDir, 'test.txt');
    secretFilePath = path.join(tempDir, 'secret.txt');

    // Create test files
    await fs.writeFile(testFilePath, 'This is test content');
    await fs.writeFile(secretFilePath, 'This is secret content');
  });

  // Clean up test files after all tests
  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('it can execute basic arithmetic (1 + 1)', async () => {
    // No permissions needed for basic operations
    const result = await runDenoScript('console.log(1 + 1);', []);
    expect(result.trim()).toBe('2');
  });

  test('it cannot read files when no permissions are set', async () => {
    // No permissions passed
    await expect(
      runDenoScript(
        `
      Deno.readTextFileSync("${testFilePath.replace(/\\/g, '\\\\')}");
    `,
        []
      )
    ).rejects.toThrow(/--allow-read/);
  });

  test('it cannot write files when no permissions are set', async () => {
    // No permissions passed
    await expect(
      runDenoScript(
        `
      Deno.writeTextFileSync("${testFilePath.replace(/\\/g, '\\\\')}", "Hello");
    `,
        []
      )
    ).rejects.toThrow(/--allow-write/);
  });

  test('with --allow-read=FILENAME, file can be read but not written to', async () => {
    // Set permission to read specific file
    const readPermissions = [`--allow-read=${testFilePath}`];

    // Should be able to read the file
    const readResult = await runDenoScript(
      `
      const content = Deno.readTextFileSync("${testFilePath.replace(/\\/g, '\\\\')}");
      console.log(content);
    `,
      readPermissions
    );

    expect(readResult.trim()).toBe('This is test content');

    // Should not be able to write to the file
    await expect(
      runDenoScript(
        `
      Deno.writeTextFileSync("${testFilePath.replace(/\\/g, '\\\\')}", "Modified content");
    `,
        readPermissions
      )
    ).rejects.toThrow(/--allow-write/);
  });

  test('if permissions allow directory read but deny subfile, other files can be read but not denied one', async () => {
    // Set permission to read directory but deny specific file
    const mixedPermissions = [`--allow-read=${tempDir}`, `--deny-read=${secretFilePath}`];

    // Should be able to read the allowed file
    const allowedReadResult = await runDenoScript(
      `
      const content = Deno.readTextFileSync("${testFilePath.replace(/\\/g, '\\\\')}");
      console.log(content);
    `,
      mixedPermissions
    );

    expect(allowedReadResult.trim()).toBe('This is test content');

    // Should not be able to read the denied file - updated to match actual error message
    await expect(
      runDenoScript(
        `
      Deno.readTextFileSync("${secretFilePath.replace(/\\/g, '\\\\')}");
    `,
        mixedPermissions
      )
    ).rejects.toThrow(/--allow-read/);
  });

  test('it cannot access the internet via IP address', async () => {
    // No network permissions
    await expect(
      runDenoScript(
        `
      await fetch("http://127.0.0.1:8000");
    `,
        []
      )
    ).rejects.toThrow(/--allow-net/);
  });

  test('it cannot access the internet via URL', async () => {
    // No network permissions
    await expect(
      runDenoScript(
        `
      await fetch("https://example.com");
    `,
        []
      )
    ).rejects.toThrow(/--allow-net/);
  });

  test('it can import cowsay from denoland without any permissions', async () => {
    // Keep the original cowsay test - this is important to verify npm imports work
    const result = await runDenoScript(
      `    
    import { say } from "https://deno.land/x/cowsay/mod.ts";
    console.log(say({
        text: "Hello World",
    }));
    `,
      []
    );

    // Check for the cow's tail pattern
    expect(result).toContain(')\\/\\');
  });

  test('it can import cowsay from npm without any permissions', async () => {
    // Keep the original cowsay test - this is important to verify npm imports work
    const result = await runDenoScript(
      `
      import cowsay from "npm:cowsay";
      console.log(cowsay.say({text: "Hello"}));
    `,
      []
    );

    // Check for the cow's tail pattern
    expect(result).toContain(')\\/\\');
  });
});
