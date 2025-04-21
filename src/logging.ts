export interface Logger {
  log: (...args: any) => any;
  error: (...args: any) => any;
}

export const DEFAULT_LOGGER: Logger = {
  log: (...args: any) => console.log(...args),
  error: (...args: any) => console.error(...args),
}

/**
 * Formats error messages from Deno, providing clearer information for permission errors
 * @param error The error object or string to format
 * @returns A formatted error message
 */
export function formatError(error: Error | string): string {
    let errorMessage: string = error instanceof Error ? error.message : String(error);
  
    // Check if it's a permission error
    if (errorMessage.includes('NotCapable')) {
      // Extract the core error message, removing stack traces and extra context
      const permissionMatch = errorMessage.match(/NotCapable: ([^\n]+)/);
      if (permissionMatch) {
        const requiredPermission = permissionMatch[1];
  
        // Extract the specific flag needed from the error message
        // This improved regex captures both basic flags (--allow-read)
        // and flags with path arguments (--allow-read=/path/to/file)
        const flagMatch = requiredPermission.match(/(--allow-[a-z]+(?:=[^\s]+)?)/);
  
        // If we have a specific flag, use it; otherwise provide a general message
        const permissionFlag = flagMatch ? flagMatch[1] : 'specific permissions';
  
        // For flags with path arguments, provide more specific guidance
        let additionalInfo = '';
        if (permissionFlag.includes('=')) {
          // Extract the base permission type for clarity
          const basePermission = permissionFlag.split('=')[0];
          additionalInfo = `\nNote: You need access to a specific path. Either grant access to this exact path or use ${basePermission} without a path argument to grant broader access.`;
        }
  
        return `The MCP server does not have sufficient permissions to run this code. 
  Required permission: ${requiredPermission}
  The server needs to be restarted with ${permissionFlag} to run this code.${additionalInfo}`;
      }
    } else if (errorMessage.includes('Deno process exited with code')) {
      // For syntax errors or runtime errors, extract the main error message
      const syntaxMatch = errorMessage.match(/error: ([^\n]+)/);
      if (syntaxMatch) {
        return syntaxMatch[1];
      }
    }
  
    return errorMessage;
  }
