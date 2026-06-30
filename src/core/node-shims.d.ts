declare module 'node:crypto' {
  export function randomUUID(): string;
}

declare module 'node:http' {
  export interface IncomingMessage {
    url?: string;
    method?: string;
  }

  export interface ServerResponse {
    writeHead(statusCode: number, headers?: Record<string, string>): void;
    end(body?: string): void;
  }

  export interface Server {
    listen(port: number, callback?: () => void): void;
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

declare const process: {
  env: Record<string, string | undefined>;
};

declare const console: {
  log(message?: unknown, ...optionalParams: unknown[]): void;
};
