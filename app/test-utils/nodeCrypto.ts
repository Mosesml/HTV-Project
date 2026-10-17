// Node's crypto for tests and the expo-crypto stand-in. The app has no @types/node, so the few
// functions used are typed here and loaded with jest.requireActual.

interface NodeHash {
  update(data: string, encoding: 'utf8'): NodeHash;
  digest(encoding: 'hex' | 'base64'): string;
}

interface NodeCrypto {
  createHash(algorithm: string): NodeHash;
  randomBytes(size: number): Uint8Array;
  randomUUID(): string;
}

export const nodeCrypto = jest.requireActual<NodeCrypto>('crypto');

/** Lowercase hex SHA-256 of a UTF-8 string, computed by Node (not by the app's code). */
export function nodeSha256(text: string): string {
  return nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex');
}
