import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocket, WebSocketServer } from 'ws';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerServie } from './connection-manager.service';
import { randomUUID } from 'crypto';
import {
  AuthorizeRequest,
  AuthorizeResponse,
  BootNotificationRequest,
  BootNotificationResponse,
  HeartBeatResponse,
  OcppActionMap,
  OcppCall,
  OcppMessageType,
  StartTransactionRequest,
  StartTransactionResponse,
  StatusNotificationRequest,
  StatusNotificationResponse,
} from './ocpp.types';

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
}

@Injectable()
export class OcppServerService implements OnModuleInit, OnModuleDestroy {
  private wss!: WebSocketServer;
  private transactionId: number = 1;
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(
    private readonly chargeStateService: ChargeStateService,
    private readonly connectionManagerService: ConnectionManagerServie,
  ) {}

  private async sendCall<A extends keyof OcppActionMap>(
    chargePointId: string,
    action: A,
    payload: OcppActionMap[A]['request'],
  ): Promise<OcppActionMap[A]['response']> {
    const socket = this.connectionManagerService.get(chargePointId);

    if (!socket) {
      throw new Error(`Charge point ${chargePointId} is not connected`);
    }

    const messageId = randomUUID();

    const message: OcppCall<A> = [
      OcppMessageType.Call,
      messageId,
      action,
      payload,
    ];

    console.log(
      `Sending ${action} to ${chargePointId}`,
      JSON.stringify(message),
    );

    return new Promise<OcppActionMap[A]['response']>((resolve, reject) => {
      this.pendingRequests.set(messageId, {
        resolve: (payload: unknown): void => {
          resolve(payload as OcppActionMap[A]['response']);
        },
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

  private sendCallResult<A extends keyof OcppActionMap>(
    socket: WebSocket,
    messageId,
    payload: OcppActionMap[A]['response'],
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

    const message: unknown = JSON.parse(rawMessage);

    if (!Array.isArray(message)) {
      throw new Error('Invalid OCPP message');
    }

    const [messageTypeId, messageId, actionOrPayload, payload] = message;

    if (messageTypeId === 2) {
      const action = actionOrPayload;
      switch (action) {
        case 'BootNotification':
          {
            const request = payload as BootNotificationRequest;
            console.log(
              `${chargePointId} BootNotification: ${JSON.stringify(request)}\n`,
            );

            const response: BootNotificationResponse = {
              currentTime: new Date().toISOString(),
              interval: 10,
              status: 'Accepted',
            };

            this.sendCallResult(socket, messageId, response);
            console.log('BootNotification accepted');

            const result = await this.sendCall(
              chargePointId,
              'RemoteStartTransaction',
              {
                connectorId: 1,
                idTag: 'TEST',
              },
            );

            console.log(`BootNotification result: `, result);
          }
          break;
        case 'Heartbeat':
          {
            console.log(`${chargePointId} HeartBeat`);

            const response: HeartBeatResponse = {
              currentTime: new Date().toISOString(),
            };
            this.sendCallResult(socket, messageId, response);

            console.log('Heartbeat responded');
          }
          break;
        case 'StatusNotification':
          {
            const request = payload as StatusNotificationRequest;
            console.log(
              `${chargePointId} connector ${request.connectorId}: ${request.status}`,
            );

            this.chargeStateService.updateConnector(chargePointId, {
              connectorId: request.connectorId,
              status: request.status,
              errorCode: request.errorCode,
              updatedAt: new Date(),
            });

            this.sendCallResult(
              socket,
              messageId,
              {} as StatusNotificationResponse,
            );
          }
          break;
        case 'Authorize':
          {
            const request: AuthorizeRequest = payload as AuthorizeRequest;
            console.log(`${chargePointId} Authorize: ${request.idTag}`);

            const response: AuthorizeResponse = {
              idTagInfo: {
                status: 'Accepted',
              },
            };
            this.sendCallResult(socket, messageId, response);
          }
          break;
        case 'StartTransaction':
          {
            const transactionId = this.transactionId++;

            const request = payload as StartTransactionRequest;
            console.log(
              `Start transaction from: ${chargePointId} for connector: ${request.connectorId}`,
            );

            const response: StartTransactionResponse = {
              idTagInfo: {
                status: 'Accepted',
                transactionId: transactionId,
              },
            };

            this.sendCallResult(socket, messageId, response);
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
