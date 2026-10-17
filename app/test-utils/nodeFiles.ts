// Node's file and path functions for tests that read the app's own source (the K10
// emergency-number scan). The app has no @types/node, so the few functions used are typed
// here and loaded with jest.requireActual, like nodeCrypto.ts.

interface NodeStats {
  isDirectory(): boolean;
}

interface NodeFs {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf8'): string;
  statSync(path: string): NodeStats;
}

interface NodePath {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
}

export const nodeFs = jest.requireActual<NodeFs>('fs');
export const nodePath = jest.requireActual<NodePath>('path');
