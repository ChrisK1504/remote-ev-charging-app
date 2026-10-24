import {
  BadGatewayException,
  BadRequestException,
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
import {
  validatePayload,
  isOcppAction,
  incomingActions,
  errorCodes,
  isObject,
} from './ocpp-validation';

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
    const validationError = validatePayload(action, 'request', payload);
    if (validationError) throw new BadRequestException(validationError);

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
    action: A,
  ): void {
    const error = validatePayload(action, 'response', payload);
    if (error) throw new Error(`Invalid ${action} response: ${error}`);
    const response = [3, messageId, payload];

    socket.send(JSON.stringify(response));
  }

  private handleCallResult(
    socket: WebSocket,
    messageId: string,
    payload: unknown,
  ): void {
    const action = this.pendingRequestService.getAction(messageId, socket);
    if (!action) return;
    const error = validatePayload(action, 'response', payload);
    if (error) {
      this.pendingRequestService.reject(
        messageId,
        socket,
        new BadGatewayException(`Invalid ${action} response: ${error}`),
      );
      return;
    }
    this.pendingRequestService.resolve(messageId, socket, payload);
  }

  private async handleMessage(
    chargePointId: string,
    socket: WebSocket,
    rawMessage: string,
  ): Promise<void> {
    console.log(`MESSAGE: ${rawMessage}`);

    let message: unknown;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      throw new Error('Invalid OCPP JSON');
    }
    if (!Array.isArray(message)) throw new Error('Invalid OCPP message');
    const [messageTypeId, messageId, actionOrPayload, payload, details] =
      message as unknown[];
    if (
      typeof messageId !== 'string' ||
      messageId.length === 0 ||
      messageId.length > 36
    ) {
      throw new Error('Invalid OCPP message ID');
    }
    const malformed = () => {
      if (messageTypeId === OcppMessageType.Call) {
        socket.send(
          JSON.stringify([
            4,
            messageId,
            'FormationViolation',
            'Invalid CALL envelope',
            {},
          ]),
        );
      } else {
        this.pendingRequestService.reject(
          messageId,
          socket,
          new BadGatewayException('Invalid OCPP response envelope'),
        );
      }
    };
    if (messageTypeId === OcppMessageType.Call) {
      if (
        message.length !== 4 ||
        typeof actionOrPayload !== 'string' ||
        !isObject(payload)
      ) {
        malformed();
        return;
      }
      const action = actionOrPayload;
      if (!isOcppAction(action) || !incomingActions.has(action)) {
        socket.send(
          JSON.stringify([
            4,
            messageId,
            'NotImplemented',
            'Unsupported action',
            {},
          ]),
        );
        return;
      }
      const validationError = validatePayload(action, 'request', payload);
      if (validationError) {
        socket.send(
          JSON.stringify([
            4,
            messageId,
            'FormationViolation',
            'Payload does not match action schema',
            {},
          ]),
        );
        console.warn(
          `${chargePointId} invalid ${action}, message ${messageId}: ${validationError}`,
        );
        return;
      }
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

            this.sendCallResult(socket, messageId, response, action);
            console.log('BootNotification accepted');
          }
          break;
        case 'Heartbeat':
          {
            console.log(`${chargePointId} HeartBeat`);

            const response: HeartBeatResponse = {
              currentTime: new Date().toISOString(),
            };
            this.sendCallResult(socket, messageId, response, action);

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

            this.sendCallResult(socket, messageId, {}, action);
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
            this.sendCallResult(socket, messageId, response, action);
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

              this.sendCallResult(socket, messageId, response, action);
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

            this.sendCallResult(socket, messageId, {}, action);
          }
          break;
        case 'MeterValues': {
          const request = payload as MeterValuesRequest;
          this.chargeStateService.updateMeterValues(chargePointId, request);

          this.sendCallResult(socket, messageId, {}, action);

          break;
        }
      }
      return;
    }

    if (messageTypeId === OcppMessageType.CallError) {
      if (
        message.length !== 5 ||
        typeof actionOrPayload !== 'string' ||
        !errorCodes.has(actionOrPayload) ||
        typeof payload !== 'string' ||
        !isObject(details)
      ) {
        malformed();
        return;
      }
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
      if (message.length !== 3 || !isObject(actionOrPayload)) {
        malformed();
        return;
      }
      const payload = actionOrPayload;

      this.handleCallResult(socket, messageId, payload);
      return;
    }
    throw new Error('Unsupported OCPP message type');
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
