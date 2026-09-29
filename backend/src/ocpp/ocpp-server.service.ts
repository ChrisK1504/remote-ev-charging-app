import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocket, WebSocketServer } from 'ws';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerServie } from './connection-manager.service';
import { randomUUID } from 'crypto';

@Injectable()
export class OcppServerService implements OnModuleInit, OnModuleDestroy {
  private wss!: WebSocketServer;
  private transactionId: number = 0;

  constructor(
    private readonly chargeStateService: ChargeStateService,
    private readonly connectionManagerService: ConnectionManagerServie,
  ) {}

  private sendCall(
    chargePointId: string,
    action: string,
    payload: Record<string, unknown>,
  ): string {
    const socket = this.connectionManagerService.get(chargePointId);

    if (!socket) {
      throw new Error(`Charge point ${chargePointId} is not connected`);
    }

    const messageId = randomUUID();

    const message = [2, messageId, action, payload];
    console.log(
      `Sending ${action} to ${chargePointId}`,
      JSON.stringify(message),
    );

    socket.send(JSON.stringify(message));

    return messageId;
  }

  private sendCallResult(
    socket: WebSocket,
    messageId,
    payload: Record<string, unknown>,
  ): void {
    const response = [3, messageId, payload];

    socket.send(JSON.stringify(response));
  }

  onModuleInit() {
    this.wss = new WebSocketServer({
      port: 9000,
      handleProtocols: (protocols) => {
        if (protocols.has('ocpp1.6')) {
          return 'ocpp1.6';
        }

        return false;
      },
    });

    this.wss.on('connection', (socket, request) => {
      const chargePointId = request.url?.split('/').pop();

      if (!chargePointId) {
        console.error('Connection rejected: missing charge point ID');
        socket.close(1008, 'Missing charge point ID');
        return;
      }

      this.chargeStateService.connect(chargePointId);
      this.connectionManagerService.add(chargePointId, socket);

      console.log('WebSocket connection received');
      console.log('URL:', request.url);
      console.log('Charge Point ID:', chargePointId);
      console.log('Protocol:', socket.protocol);

      socket.on('message', (data) => {
        console.log('MESSAGE:', data.toString());
        const message = JSON.parse(data.toString());

        const [messageTypeId, messageId, action, payload] = message;

        if (messageTypeId === 2) {
          switch (action) {
            case 'BootNotification':
              {
                console.log(
                  `${chargePointId} BootNotification: ${JSON.stringify(payload)}\n`,
                );
                const response = [
                  3,
                  // The same messageId is reused
                  messageId,
                  {
                    status: 'Accepted',
                    currenTime: new Date().toISOString(),
                    interval: 2,
                  },
                ];
                socket.send(JSON.stringify(response));
                console.log('BootNotification accepted');

                this.sendCall('CP_001', 'RemoteStartTransaction', {
                  connectorId: 1,
                  idTag: 'TEST',
                });
              }
              break;
            case 'Heartbeat':
              {
                console.log(`${chargePointId} HeartBeat`);
                const response = [
                  3,
                  messageId,
                  {
                    currentTime: new Date().toISOString(),
                  },
                ];

                socket.send(JSON.stringify(response));
                console.log('Heartbeat responded');
              }
              break;
            case 'StatusNotification':
              console.log(
                `${chargePointId} connector ${payload.connectorId}: ${payload.status}`,
              );

              this.chargeStateService.updateConnector(chargePointId, {
                connectorId: payload.connectorId,
                status: payload.status,
                errorCode: payload.errorCode,
                updatedAt: new Date(),
              });

              socket.send(JSON.stringify([3, messageId, {}]));
              break;
            case 'Authorize':
              {
                console.log(`${chargePointId} Authorize: ${payload.idTag}`);

                this.sendCallResult(socket, messageId, {
                  idTagInfo: {
                    status: 'Available',
                  },
                });
              }
              break;
            case 'StartTransaction':
              {
                const transactionId = this.transactionId++;
                console.log(
                  `Start transaction from: ${chargePointId} for connector: ${payload.connectorId}`,
                );

                this.sendCallResult(socket, messageId, {
                  idTagInfo: {
                    status: 'Accepted',
                    transactionId: transactionId,
                  },
                });
              }
              break;
          }
        }
      });

      socket.on('close', () => {
        console.log('Charge point disconnected');
        this.chargeStateService.disconnect(chargePointId);
      });

      socket.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.chargeStateService.disconnect(chargePointId);
      });
    });
  }
  onModuleDestroy() {
    this.wss.close();
  }
}
