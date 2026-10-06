/**
 * IPC registry (LT3-003): the only way main registers renderer-facing handlers.
 *
 * - A channel must be declared in the contract (src/main/ipc/contract.ts); anything
 *   else is refused at startup, so no handler exists outside the contract.
 * - Arguments are validated before the handler runs; invalid requests are rejected
 *   with INVALID_REQUEST and never reach application code.
 * - Results are validated before they are returned; a mismatch is a bug in main and
 *   is reported as INVALID_RESPONSE rather than leaking an unexpected shape.
 * - Errors cross the boundary as "[CODE] message" (see src/shared/ipc/errors.ts).
 */
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { IpcError, encodeIpcError } from '../../shared/ipc/errors';
import { CONTRACT, type Channel, type Args, type Result } from './contract';

type Logger = { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void; debug?: (...args: unknown[]) => void };

export type Handler<C extends Channel> = (event: IpcMainInvokeEvent, ...args: Args<C>) => Result<C> | Promise<Result<C>>;

function summarise(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map(issue => `${issue.path.length ? issue.path.join('.') : 'value'}: ${issue.message}`)
    .join('; ');
}

export class IpcRegistry {
  private readonly registered = new Set<string>();

  constructor(private readonly ipcMain: IpcMain, private readonly log: Logger) {}

  handle<C extends Channel>(channel: C, handler: Handler<C>): void {
    const spec = CONTRACT[channel];
    if (!spec) {
      throw new IpcError('UNKNOWN_CHANNEL', `Channel "${channel}" is not in the IPC contract`, channel);
    }
    if (this.registered.has(channel)) {
      throw new Error(`IPC channel "${channel}" registered twice`);
    }
    this.registered.add(channel);

    this.ipcMain.handle(channel, async (event, ...rawArgs) => {
      const args = spec.args.safeParse(rawArgs);
      if (!args.success) {
        this.log.warn(`IPC ${channel}: invalid request`, summarise(args.error));
        throw new Error(encodeIpcError(new IpcError('INVALID_REQUEST', summarise(args.error), channel)));
      }

      let result: unknown;
      try {
        result = await handler(event, ...(args.data as Args<C>));
      } catch (error) {
        if (error instanceof IpcError) throw new Error(encodeIpcError(error));
        const message = error instanceof Error ? error.message : String(error);
        this.log.error(`IPC ${channel} failed:`, message);
        throw new Error(encodeIpcError(new IpcError('INTERNAL', message, channel)));
      }

      const checked = spec.result.safeParse(result);
      if (!checked.success) {
        this.log.error(`IPC ${channel}: handler returned an invalid response`, summarise(checked.error));
        throw new Error(encodeIpcError(new IpcError('INVALID_RESPONSE', 'Unexpected response from LightTrack', channel)));
      }
      return checked.data;
    });
  }

  /** Channels declared in the contract that have no handler yet. */
  missing(): string[] {
    return (Object.keys(CONTRACT) as Channel[]).filter(c => !this.registered.has(c));
  }

  registeredChannels(): string[] {
    return [...this.registered];
  }
}
