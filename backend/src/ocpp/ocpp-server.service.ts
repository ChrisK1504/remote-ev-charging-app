import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocket, WebSocketServer } from 'ws';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerServie } from './connection-manager.service';
import { randomUUID } from 'crypto';

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
}

@Injectable()
export class OcppServerService implements OnModuleInit, OnModuleDestroy {
  private wss!: WebSocketServer;
  private transactionId: number = 0;
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(
    private readonly chargeStateService: ChargeStateService,
    private readonly connectionManagerService: ConnectionManagerServie,
  ) {}

  private async sendCall(
    chargePointId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
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

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(messageId, {
        resolve,
        reject,
      });
      socket.send(JSON.stringify(message));

      setTimeout(() => {
        const pending = this.pendingRequests.get(messageId);

        if (!pending) {
          return;
        }
        this.pendingRequests.delete(messageId);

        reject(new Error(`${action} timed out`));
      }, 10000);
    });
  }

  private sendCallResult(
    socket: WebSocket,
    messageId,
    payload: Record<string, unknown>,
  ): void {
    const response = [3, messageId, payload];

    socket.send(JSON.stringify(response));
  }

  private handleCallResult(messageId: string, payload: unknown): void {
    const pending = this.pendingRequests.get(messageId);

    if (!pending) {
      console.warn(`No pending requests for ${messageId}`);
      return;
    }

    this.pendingRequests.delete(messageId);
    pending.resolve(payload);
  }

  private async handleMessage(
    chargePointId,
    socket: WebSocket,
    rawMessage: string,
  ): Promise<void> {
    console.log(`MESSAGE: ${rawMessage}`);

    const message = JSON.parse(rawMessage);
    const [messageTypeId, messageId, actionOrPayload, payload] = message;

    if (messageTypeId === 2) {
      const action = actionOrPayload;

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
                currentTime: new Date().toISOString(),
                interval: 2,
              },
            ];
            socket.send(JSON.stringify(response));
            console.log('BootNotification accepted');

            const result = await this.sendCall(
              chargePointId,
              'RemoteStartTransaction',
              {
                connectorId: 1,
                idTag: 'TEST',
              },
            );

            console.log(`Bootnotification result: `, result);
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
                status: 'Accepted',
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
      return;
    }

    if (messageTypeId === 3) {
      const payload = actionOrPayload;

      this.handleCallResult(messageId, payload);
      return;
    }
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
        void this.handleMessage(chargePointId, socket, data.toString()).catch(
          (error) => {
            console.error(`${chargePointId} Failed to handle message:`, error);
          },
        );
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
