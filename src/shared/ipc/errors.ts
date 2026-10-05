/**
 * IPC error contract (LT3-003).
 *
 * Electron only carries an error's message across ipcRenderer.invoke, so the error
 * code travels as a "[CODE] message" prefix. Main encodes; the preload decodes.
 */

export const IPC_ERROR_CODES = [
  'INVALID_REQUEST',   // arguments failed schema validation
  'UNKNOWN_CHANNEL',   // channel is not part of the contract
  'INVALID_RESPONSE',  // the handler returned something outside its contract (a bug in main)
  'NOT_FOUND',         // the requested record does not exist
  'CONFLICT',          // the change conflicts with stored state
  'INTERNAL'           // anything else
] as const;

export type IpcErrorCode = typeof IPC_ERROR_CODES[number];

export class IpcError extends Error {
  readonly code: IpcErrorCode;
  readonly channel?: string;

  constructor(code: IpcErrorCode, message: string, channel?: string) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
    this.channel = channel;
  }
}

const PREFIX = /^\[([A-Z_]+)\] /;

/** Message to throw from main so the code survives the IPC boundary. */
export function encodeIpcError(error: IpcError): string {
  return `[${error.code}] ${error.message}`;
}

/**
 * Turn an error from ipcRenderer.invoke back into an IpcError.
 * Electron wraps messages as "Error invoking remote method '<channel>': Error: <message>".
 */
export function decodeIpcError(error: unknown, channel?: string): IpcError {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const message = raw
    .replace(/^Error invoking remote method '[^']*': /, '')
    .replace(/^\w*Error: /, '');
  const match = PREFIX.exec(message);
  if (match && (IPC_ERROR_CODES as readonly string[]).includes(match[1])) {
    return new IpcError(match[1] as IpcErrorCode, message.slice(match[0].length), channel);
  }
  return new IpcError('INTERNAL', message || 'Request failed', channel);
}
