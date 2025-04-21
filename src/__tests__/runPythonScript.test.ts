import { runPythonScript } from '../runPython';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Increase test timeout to handle Pyodide initialization delay
jest.setTimeout(30000);

describe('Python Sandbox Integration Tests', () => {
  let tempDir: string;

  // Create temporary directory before tests
  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'python-sandbox-test-'));
  });

  // Clean up test files after all tests
  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('it can execute basic YAML parsing without any permissions', async () => {
    const result = await runPythonScript(
      `
import yaml
import json
d = yaml.safe_load("""
---
foo: 1
bar:
    baz: [1,2,3]
""")
print(json.dumps(d))
    `,
      []
    );

    // Parse the JSON output and check the structure
    const parsed = JSON.parse(result.trim());
    expect(parsed.foo).toBe(1);
    expect(parsed.bar.baz).toEqual([1, 2, 3]);
  });

  test('it can access host files when appropriate permissions are granted', async () => {
    // Create a test file in the temp directory
    const testFilePath = path.join(tempDir, 'readable-file.txt');
    await fs.writeFile(testFilePath, 'File with permissions granted');

    // Try to access it from Python with proper permissions
    const result = await runPythonScript(
      `
with open("${testFilePath}", "r") as f:
    content = f.read()
    print(content)
      `,
      [`--allow-read=${tempDir}`] // Grant specific permission to the temp directory
    );

    expect(result.trim()).toBe('File with permissions granted');
  });

  test('it cannot access host files without appropriate permissions', async () => {
    // Create a test file in the temp directory
    const testFilePath = path.join(tempDir, 'restricted-file.txt');
    await fs.writeFile(testFilePath, 'File with no permissions granted');

    // Try to access it from Python without proper permissions
    await expect(
      runPythonScript(
        `
with open("${testFilePath}", "r") as f:
    content = f.read()
    print(content)
        `,
        [] // No permissions granted
      )
    ).rejects.toThrow();
  });

  test('it cannot access host files outside granted directories', async () => {
    // Create a test file in a different location than what permissions are granted for
    const otherTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'python-sandbox-other-'));
    try {
      const testFilePath = path.join(otherTempDir, 'outside-file.txt');
      await fs.writeFile(testFilePath, 'File outside permitted directory');

      // Try to access it from Python with permissions for a different directory
      await expect(
        runPythonScript(
          `
with open("${testFilePath}", "r") as f:
    content = f.read()
    print(content)
          `,
          [`--allow-read=${tempDir}`] // Permission for a different directory
        )
      ).rejects.toThrow();
    } finally {
      await fs.rm(otherTempDir, { recursive: true, force: true });
    }
  });

  test('it can write to host files when appropriate permissions are granted', async () => {
    const testFilePath = path.join(tempDir, 'writable-file.txt');

    // Write to a file with proper permissions
    await runPythonScript(
      `
import js
js.fs.writeFileSync("${testFilePath}", "Successfully wrote to host file")
      `,
      [`--allow-read=${tempDir}`, `--allow-write=${tempDir}`] // Grant specific write permission to the temp directory
    );

    // Verify the file was written correctly
    const fileContent = await fs.readFile(testFilePath, 'utf8');
    expect(fileContent).toBe('Successfully wrote to host file');
  });

  test('it cannot write to host files without appropriate permissions', async () => {
    const testFilePath = path.join(tempDir, 'no-write-file.txt');

    // Try to write to a file without permissions
    await expect(
      runPythonScript(
        `
import js
js.fs.writeFileSync("${testFilePath}", "This should not work")
        `,
        [] // No permissions granted
      )
    ).rejects.toThrow();

    // Verify the file doesn't exist
    await expect(fs.access(testFilePath)).rejects.toThrow();
  });

  test('it cannot access the internet via requests without permissions', async () => {
    await expect(
      runPythonScript(
        `
import requests
response = requests.get("https://example.com")
print(response.text)
        `,
        []
      )
    ).rejects.toThrow(/--allow-net/);
  }, 30000);

  test('it can execute numpy operations without permissions', async () => {
    const result = await runPythonScript(
      `
import numpy as np
import json

# Simple array operations
arr = np.array([1, 2, 3, 4, 5])
result = {
    "mean": float(np.mean(arr)),
    "sum": int(np.sum(arr))
}

print(json.dumps(result))
    `,
      []
    );

    const parsed = JSON.parse(result.trim());
    expect(parsed.mean).toBe(3);
    expect(parsed.sum).toBe(15);
  });
});
