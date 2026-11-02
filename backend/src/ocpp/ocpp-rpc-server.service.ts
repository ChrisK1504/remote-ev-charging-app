import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChargerService } from './charger.service';
import { createRPCError, RPCServer } from 'ocpp-rpc';
import { UserService } from '../users/user.service';
import { RpcConnectionManagerService } from './rpc-connection-manager.service';
import { ChargeStateService } from './charger-state.service';
import type {
  StartTransactionRequest,
  StatusNotificationRequest,
  StopTransactionRequest,
} from './ocpp.types';
import {
  ActiveSessionConflictError,
  SessionService,
} from '../session/session.service';

@Injectable()
export class OcppRpcServerService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly chargerService: ChargerService,
    private readonly userService: UserService,
    private readonly connections: RpcConnectionManagerService,
    private readonly chargeStateService: ChargeStateService,
    private readonly sessionService: SessionService,
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
        if (this.connections.get(client.identity) !== client) return;
        this.connections.removeIfCurrent(client.identity, client);
        this.chargeStateService.disconnect(client.identity);
      });
      this.connections.add(client);
      this.chargeStateService.connect(client.identity);
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

      client.handle(
        'StatusNotification',
        ({ params }: { params: StatusNotificationRequest }) => {
          if (this.connections.get(client.identity) !== client) {
            throw createRPCError(
              'GenericError',
              'Connection is no longer current',
            );
          }
          console.log(
            `${client.identity} connector ${params.connectorId}: ${params.status}`,
          );
          this.chargeStateService.updateConnector(client.identity, {
            connectorId: params.connectorId,
            status: params.status,
            errorCode: params.errorCode,
            updatedAt: new Date(),
          });
          return {};
        },
      );

      client.handle(
        'StartTransaction',
        async ({ params }: { params: StartTransactionRequest }) => {
          if (this.connections.get(client.identity) !== client) {
            throw createRPCError(
              'GenericError',
              'Connection is no longer current',
            );
          }
          console.log(
            `Start transaction from: ${client.identity} for connector: ${params.connectorId}`,
          );
          try {
            const outcome = await this.sessionService.start({
              chargePointId: client.identity,
              connectorId: params.connectorId,
              idTag: params.idTag,
              meterStart: params.meterStart,
              startedAt: new Date(params.timestamp),
            });
            return {
              transactionId: outcome.transactionId,
              idTagInfo: { status: outcome.authorizationStatus },
            };
          } catch (error) {
            if (error instanceof ActiveSessionConflictError) {
              throw createRPCError(
                'GenericError',
                'Connector already has an active session',
              );
            }
            throw error;
          }
        },
      );

      client.handle(
        'StopTransaction',
        async ({ params }: { params: StopTransactionRequest }) => {
          if (this.connections.get(client.identity) !== client) {
            throw createRPCError(
              'GenericError',
              'Connection is no longer current',
            );
          }
          const completed = await this.sessionService.complete({
            transactionId: params.transactionId,
            chargePointId: client.identity,
            endedAt: new Date(params.timestamp),
            meterStop: params.meterStop,
          });
          if (completed) {
            console.log(`Completed transaction ${params.transactionId}`);
          } else {
            console.log(
              `No active session matched transaction ${params.transactionId} for charger ${client.identity}`,
            );
          }
          return {};
        },
      );

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
