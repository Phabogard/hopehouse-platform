declare module 'node:crypto' {
  export function randomUUID(): string;
  export function randomBytes(size: number): { toString(encoding: 'base64url' | 'hex'): string };
  export function createHash(algorithm: string): { update(data: string): { digest(encoding: 'hex' | 'base64url'): string } };
  export function createHmac(algorithm: string, key: string): { update(data: string): { digest(encoding: 'hex' | 'base64url'): string } };
  export function timingSafeEqual(left: Buffer, right: Buffer): boolean;
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:http' {
  export interface IncomingMessage {
    headers: Record<string, string | undefined>;
    url?: string;
    method?: string;
    on(event: 'data', listener: (chunk: string | Buffer) => void): void;
    on(event: 'end', listener: () => void): void;
    on(event: 'error', listener: (error: Error) => void): void;
  }

  export interface ServerResponse {
    writeHead(statusCode: number, headers?: Record<string, string>): void;
    end(body?: string): void;
  }

  export interface AddressInfo {
    port: number;
  }

  export interface Server {
    listen(port: number, callback?: () => void): void;
    address(): AddressInfo | string | null;
    close(callback?: () => void): void;
  }

  export function createServer(handler: (request: IncomingMessage, response: ServerResponse) => void): Server;
}

declare module 'node:assert/strict' {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    throws(block: () => unknown, expected?: RegExp, message?: string): void;
  };
  export default assert;
}

declare module 'node:test' {
  export default function test(name: string, fn: () => void | Promise<void>): void;
}

declare class Buffer {
  constructor(value: string, encoding?: string);
  readonly length: number;
  toString(encoding?: string): string;
  static byteLength(value: string): number;
  static from(value: string, encoding?: string): Buffer;
}

declare const process: {
  env: Record<string, string | undefined>;
};

declare const console: {
  log(message?: unknown, ...optionalParams: unknown[]): void;
};

declare function fetch(input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; json(): Promise<unknown> }>;
