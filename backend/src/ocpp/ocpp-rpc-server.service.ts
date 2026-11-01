import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChargerService } from './charger.service';
import { createRPCError, RPCServer } from 'ocpp-rpc';

@Injectable()
export class OcppRpcServerService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly chargerService: ChargerService) {}
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

      client.handle(({ method, params }) => {
        throw createRPCError('NotImplemented');
      });
    });

    await this.server.listen(9001);
  }

  async onModuleDestroy() {
    await this.server.close({ code: 1 });
  }
}
