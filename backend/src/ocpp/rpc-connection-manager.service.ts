import { Injectable, Logger } from '@nestjs/common';
import type RPCServerClient from 'ocpp-rpc/lib/server-client';

@Injectable()
export class RpcConnectionManagerService {
  private readonly logger = new Logger(RpcConnectionManagerService.name);
  private readonly connections = new Map<string, RPCServerClient>();

  get(identity: string): RPCServerClient | undefined {
    return this.connections.get(identity);
  }

  add(client: RPCServerClient): void {
    const identity = client.identity;
    if (identity === undefined) {
      throw new Error('Cannot register an RPC client without an identity');
    }
    const previous = this.connections.get(identity);
    this.connections.set(identity, client);

    if (previous && previous !== client) {
      void previous
        .close({ code: 1000, reason: 'Connection replaced' })
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to close replaced RPC client ${client.identity}: ${String(error)}`,
          );
        });
    }
  }

  removeIfCurrent(identity: string, client: RPCServerClient): void {
    if (this.connections.get(identity) === client) {
      this.connections.delete(identity);
    }
  }
}
