// src/logger.ts

let isVerbose = false;

export function initializeLogger(verboseEnabled: boolean): void {
  isVerbose = verboseEnabled;
}

// Generic log function, only outputs if verbose is true
export function log(...args: any[]): void {
  if (isVerbose) {
    console.log('[LOG]', ...args);
  }
}

// Info level, always outputs (can be adjusted)
export function info(...args: any[]): void {
  console.info('[INFO]', ...args);
}

// Warn level, always outputs
export function warn(...args: any[]): void {
  console.warn('[WARN]', ...args);
}

// Error level, always outputs
export function error(...args: any[]): void {
  console.error('[ERROR]', ...args);
}

// Fatal error, always outputs (could also include process.exit if desired)
export function fatal(...args: any[]): void {
  console.error('[FATAL]', ...args);
}

// Specific function for outputting the final result
export function printResult(message: string): void {
  console.log(message);
}

// Debug function, similar to log, only if verbose
export function debug(...args: any[]): void {
  if (isVerbose) {
    console.debug('[DEBUG]', ...args);
  }
}

export default {
  initialize: initializeLogger,
  log,
  info,
  warn,
  error,
  fatal,
  debug,
  printResult,
};
