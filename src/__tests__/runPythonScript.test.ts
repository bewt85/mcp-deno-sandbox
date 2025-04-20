import { runPythonScript } from '../runPython';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Increase test timeout to handle Pyodide initialization delay
jest.setTimeout(30000);

describe('Python Sandbox Integration Tests', () => {
  let tempDir: string;

  // Only create temporary directory before tests
  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'python-sandbox-test-'));
  });

  // Clean up test files after all tests
  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('it can execute basic YAML parsing without any permissions', async () => {
    const result = await runPythonScript(`
import yaml
import json
d = yaml.safe_load("""
---
foo: 1
bar:
    baz: [1,2,3]
""")
print(json.dumps(d))
    `, []);
    
    // Parse the JSON output and check the structure
    const parsed = JSON.parse(result.trim());
    expect(parsed.foo).toBe(1);
    expect(parsed.bar.baz).toEqual([1, 2, 3]);
  });

  test('it can read and write files in a virtual filesystem', async () => {
    // Test basic file operations in Pyodide's virtual file system
    const result = await runPythonScript(`
with open("test_file.txt", "w") as f:
    f.write("Hello from Python")

with open("test_file.txt", "r") as f:
    content = f.read()
    
print(content)
    `, []);
    
    expect(result.trim()).toBe("Hello from Python");
  });

  test('it cannot access host files directly', async () => {
    // Create a test file
    const testFilePath = path.join(tempDir, 'test.txt');
    await fs.writeFile(testFilePath, 'This is test content');

    // Try to access it from Python
    await expect(
      runPythonScript(
        `
with open("${testFilePath}", "r") as f:
    content = f.read()
    print(content)
        `,
        ["--allow-read"]
      )
    ).rejects.toThrow();
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
    const result = await runPythonScript(`
import numpy as np
import json

# Simple array operations
arr = np.array([1, 2, 3, 4, 5])
result = {
    "mean": float(np.mean(arr)),
    "sum": int(np.sum(arr))
}

print(json.dumps(result))
    `, []);
    
    const parsed = JSON.parse(result.trim());
    expect(parsed.mean).toBe(3);
    expect(parsed.sum).toBe(15);
  });
});