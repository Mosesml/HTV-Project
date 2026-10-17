// The parts of `expo-crypto` the app uses, backed by Node's crypto so Jest gets real random
// bytes and real SHA-256 digests. jest.setup.ts installs it for every app test.

import { nodeCrypto } from './nodeCrypto';

const NODE_ALGORITHMS: Record<string, string> = {
  'SHA-1': 'sha1',
  'SHA-256': 'sha256',
  'SHA-384': 'sha384',
  'SHA-512': 'sha512',
  MD5: 'md5',
};

export const fakeExpoCrypto = {
  __esModule: true,
  CryptoDigestAlgorithm: {
    SHA1: 'SHA-1',
    SHA256: 'SHA-256',
    SHA384: 'SHA-384',
    SHA512: 'SHA-512',
    MD5: 'MD5',
  },
  CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  randomUUID: (): string => nodeCrypto.randomUUID(),
  getRandomBytes: (byteCount: number): Uint8Array => new Uint8Array(nodeCrypto.randomBytes(byteCount)),
  getRandomBytesAsync: async (byteCount: number): Promise<Uint8Array> => new Uint8Array(nodeCrypto.randomBytes(byteCount)),
  digestStringAsync: async (
    algorithm: string,
    data: string,
    options: { encoding?: 'hex' | 'base64' } = {}
  ): Promise<string> => {
    const nodeAlgorithm = NODE_ALGORITHMS[algorithm];
    if (!nodeAlgorithm) throw new Error(`Unsupported digest algorithm '${algorithm}'`);
    return nodeCrypto.createHash(nodeAlgorithm).update(data, 'utf8').digest(options.encoding ?? 'hex');
  },
};
