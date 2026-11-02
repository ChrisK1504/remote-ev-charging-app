import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChargerService } from './charger.service';
import { createRPCError, RPCServer } from 'ocpp-rpc';
import { UserService } from '../users/user.service';
import { RpcConnectionManagerService } from './rpc-connection-manager.service';

@Injectable()
export class OcppRpcServerService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly chargerService: ChargerService,
    private readonly userService: UserService,
    private readonly connections: RpcConnectionManagerService,
  ) {}
  private server!: RPCServer;

  async onModuleInit() {
    this.server = new RPCServer({
      protocols: ['ocpp1.6'],
      strictMode: true,
    });
    this.server.auth((accept, reject, handshake) => {
      accept({
        sessionId: 'TEST123',
      });
    });

    this.server.on('client', (client) => {
      client.on('close', () => {
        this.connections.removeIfCurrent(client.identity, client);
      });
      this.connections.add(client);
      console.log(`${client.session.sessionId} connected!`);

      client.handle('BootNotification', async ({ params }) => {
        console.log(
          `Server got BootNotification from ${client.identity}`,
          params,
        );

        await this.chargerService.registerOrUpdate(client.identity, params);

        return {
          status: 'Accepted',
          interval: 300,
          currentTime: new Date().toISOString(),
        };
      });

      client.handle('Heartbeat', ({ params }) => {
        console.log(`Server got Heartbeat from ${client.identity}`, params);
        return { currentTime: new Date().toISOString() };
      });

      client.handle('Authorize', async ({ params }) => {
        console.log(`Server got Authorize from ${client.identity}`, params);
        const authorizedUser = await this.userService.findByIdTag(params.idTag);
        if (authorizedUser) {
          return { idTagInfo: { status: 'Accepted' } };
        }
        return { idTagInfo: { status: 'Invalid' } };
      });

      client.handle(({ method, params }) => {
        throw createRPCError('NotImplemented');
      });
    });

    await this.server.listen(9001);
  }

  async onModuleDestroy() {
    await this.server.close({ code: 1001, reason: 'Server shutting down' });
  }
}
