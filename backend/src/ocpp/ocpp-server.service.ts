import {
  BadGatewayException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WebSocket, WebSocketServer } from 'ws';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerService as ConnectionManagerService } from './connection-manager.service';
import { randomUUID } from 'crypto';
import {
  AuthorizeRequest,
  AuthorizeResponse,
  BootNotificationRequest,
  BootNotificationResponse,
  HeartBeatResponse,
  MeterValuesRequest,
  OcppActionMap,
  OcppCall,
  OcppMessageType,
  RemoteStartTransactionRequest,
  RemoteStopTransactionRequest,
  StartTransactionRequest,
  StartTransactionResponse,
  StatusNotificationRequest,
  StopTransactionRequest,
} from './ocpp.types';

import {
  ActiveSessionConflictError,
  SessionService,
} from '../session/session.service';
import { PendingRequestService } from './pending-request.service';

@Injectable()
export class OcppServerService implements OnModuleInit, OnModuleDestroy {
  private wss!: WebSocketServer;

  constructor(
    private readonly chargeStateService: ChargeStateService,
    private readonly connectionManagerService: ConnectionManagerService,
    private readonly sessionService: SessionService,
    private readonly pendingRequestService: PendingRequestService,
  ) {}

  async getActiveSession(chargePointId: string, connectorId: number) {
    const activeSession = await this.sessionService.findActive(
      chargePointId,
      connectorId,
    );
    console.log(activeSession);
    return activeSession;
  }

  remoteStartTransaction(
    chargePointId: string,
    payload: RemoteStartTransactionRequest,
  ) {
    return this.sendCall(chargePointId, 'RemoteStartTransaction', payload);
  }

  remoteStopTransaction(
    chargePointId: string,
    payload: RemoteStopTransactionRequest,
  ) {
    return this.sendCall(chargePointId, 'RemoteStopTransaction', payload);
  }

  private async sendCall<A extends keyof OcppActionMap>(
    chargePointId: string,
    action: A,
    payload: OcppActionMap[A]['request'],
  ): Promise<OcppActionMap[A]['response']> {
    const socket = this.connectionManagerService.get(chargePointId);

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new ServiceUnavailableException(
        `Charge point ${chargePointId} is not connected`,
      );
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

    const response = this.pendingRequestService.register(
      messageId,
      socket,
      action,
    );

    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      this.pendingRequestService.reject(
        messageId,
        socket,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return response as Promise<OcppActionMap[A]['response']>;
  }

  private sendCallResult<A extends keyof OcppActionMap>(
    socket: WebSocket,
    messageId: string,
    payload: OcppActionMap[A]['response'],
  ): void {
    const response = [3, messageId, payload];

    socket.send(JSON.stringify(response));
  }

  private handleCallResult(
    socket: WebSocket,
    messageId: string,
    payload: unknown,
  ): void {
    this.pendingRequestService.resolve(messageId, socket, payload);
  }

  private async handleMessage(
    chargePointId: string,
    socket: WebSocket,
    rawMessage: string,
  ): Promise<void> {
    console.log(`MESSAGE: ${rawMessage}`);

    const message: unknown = JSON.parse(rawMessage);

    if (!Array.isArray(message)) {
      throw new Error('Invalid OCPP message');
    }

    const [messageTypeId, messageId, actionOrPayload, payload] =
      message as unknown[];
    if (typeof messageId !== 'string') {
      throw new Error('Invalid OCPP message ID');
    }

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

            this.sendCallResult(socket, messageId, {});
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
            const request = payload as StartTransactionRequest;

            console.log(
              `Start transaction from: ${chargePointId} for connector: ${request.connectorId}`,
            );

            try {
              const outcome = await this.sessionService.start({
                chargePointId,
                connectorId: request.connectorId,
                idTag: request.idTag,
                meterStart: request.meterStart,
                startedAt: new Date(request.timestamp),
              });

              const response: StartTransactionResponse = {
                transactionId: outcome.transactionId,
                idTagInfo: {
                  status: outcome.authorizationStatus,
                },
              };

              this.sendCallResult(socket, messageId, response);
            } catch (error) {
              if (error instanceof ActiveSessionConflictError) {
                console.warn(
                  `StartTransaction conflict: ${chargePointId} connector ${request.connectorId}, message ${messageId}`,
                );
                socket.send(
                  JSON.stringify([
                    OcppMessageType.CallError,
                    messageId,
                    'GenericError',
                    'Connector already has an active session',
                    {},
                  ]),
                );
              } else {
                throw error;
              }
            }
          }
          break;
        case 'StopTransaction':
          {
            const request: StopTransactionRequest =
              payload as StopTransactionRequest;
            console.log(
              `${chargePointId} Stop Transaction: ${JSON.stringify(request)}`,
            );

            const result = await this.sessionService.complete({
              transactionId: request.transactionId,
              chargePointId: chargePointId,
              endedAt: new Date(request.timestamp),
              meterStop: request.meterStop,
            });

            if (result) {
              console.log(`Completed transaction ${request.transactionId}`);
            } else {
              console.log(
                `No active session matched transaction ${request.transactionId} for charger ${chargePointId}`,
              );
            }

            this.sendCallResult(socket, messageId, {});
          }
          break;
        case 'MeterValues': {
          const request = payload as MeterValuesRequest;
          this.chargeStateService.updateMeterValues(chargePointId, request);

          this.sendCallResult<'MeterValues'>(socket, messageId, {});

          break;
        }
      }
      return;
    }

    if (
      messageTypeId === OcppMessageType.CallError &&
      typeof messageId === 'string'
    ) {
      this.pendingRequestService.reject(
        messageId,
        socket,
        new BadGatewayException({
          message: 'Charger returned an OCPP error',
          errorCode: actionOrPayload,
          description: payload,
        }),
      );
      return;
    }

    if (messageTypeId === 3) {
      const payload = actionOrPayload;

      this.handleCallResult(socket, messageId, payload);
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
        const buffer = Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.isBuffer(data)
            ? data
            : Buffer.from(data);
        void this.handleMessage(
          chargePointId,
          socket,
          buffer.toString('utf8'),
        ).catch((error) => {
          console.error(`${chargePointId} Failed to handle message:`, error);
        });
      });

      socket.on('close', () => {
        console.log('Charge point disconnected');
        if (this.connectionManagerService.get(chargePointId) === socket) {
          this.connectionManagerService.remove(chargePointId);
          this.chargeStateService.disconnect(chargePointId);
        }
      });

      socket.on('error', (error) => {
        console.error('WebSocket error:', error);
        if (this.connectionManagerService.get(chargePointId) === socket) {
          this.chargeStateService.disconnect(chargePointId);
        }
      });
    });
  }

  onModuleDestroy() {
    this.wss.close();
  }
}
