// An in-memory stand-in for the parts of `expo-file-system` the settings store uses (`File`,
// `Directory`, `Paths.document`). jest.setup.ts installs it for every app test; tests reach
// it with `fakeFileSystem()` from test-utils/fakeFiles.ts.

type PathPart = string | FakeDirectory | FakeFile;

interface RelocationOptions {
  overwrite?: boolean;
}

export interface FakeFileSystemControls {
  /** Every file's contents by URI. */
  readonly files: ReadonlyMap<string, string>;
  /** Puts a file in place, e.g. one an earlier app version wrote. */
  seed(uri: string, contents: string): void;
  /** The next `write()` throws this error (once). */
  failNextWrite(error: Error): void;
  /** Empties the file system and clears any armed failure. */
  reset(): void;
}

const DOCUMENT_URI = 'file:///fake/Documents';

let files = new Map<string, string>();
let nextWriteError: Error | null = null;

function joinParts(parts: PathPart[]): string {
  return parts
    .map((part) => (typeof part === 'string' ? part : part.uri))
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, '') : part.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

export class FakeDirectory {
  readonly uri: string;

  constructor(...parts: PathPart[]) {
    this.uri = joinParts(parts);
  }
}

export class FakeFile {
  uri: string;

  constructor(...parts: PathPart[]) {
    this.uri = joinParts(parts);
  }

  get exists(): boolean {
    return files.has(this.uri);
  }

  async text(): Promise<string> {
    return this.textSync();
  }

  textSync(): string {
    const contents = files.get(this.uri);
    if (contents === undefined) throw new Error(`File '${this.uri}' does not exist`);
    return contents;
  }

  write(content: string): void {
    if (nextWriteError) {
      const error = nextWriteError;
      nextWriteError = null;
      throw error;
    }
    files = new Map(files).set(this.uri, content);
  }

  delete(): void {
    if (!files.has(this.uri)) throw new Error(`File '${this.uri}' does not exist`);
    const next = new Map(files);
    next.delete(this.uri);
    files = next;
  }

  moveSync(destination: FakeFile, options: RelocationOptions = {}): void {
    const contents = this.textSync();
    if (files.has(destination.uri) && !options.overwrite) {
      throw new Error(`File '${destination.uri}' already exists`);
    }
    const next = new Map(files);
    next.delete(this.uri);
    next.set(destination.uri, contents);
    files = next;
    this.uri = destination.uri;
  }
}

export const controls: FakeFileSystemControls = {
  get files() {
    return files;
  },
  seed(uri, contents) {
    files = new Map(files).set(uri, contents);
  },
  failNextWrite(error) {
    nextWriteError = error;
  },
  reset() {
    files = new Map();
    nextWriteError = null;
  },
};

/** The module shape jest.setup.ts hands to `jest.mock('expo-file-system')`. */
export const fakeExpoFileSystem = {
  __esModule: true,
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: { document: new FakeDirectory(DOCUMENT_URI) },
  __controls: controls,
};
