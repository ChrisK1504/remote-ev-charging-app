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
import { ConnectionManagerService } from './connection-manager.service';
import { randomUUID } from 'crypto';
import {
  OcppActionMap,
  OcppCallMessage,
  IncomingOcppCall,
  OcppCall,
  OcppCallResult,
  OcppCallError,
  OcppErrorCode,
  OcppMessageType,
  RemoteStartTransactionRequest,
  RemoteStopTransactionRequest,
} from './ocpp.types';

import {
  ActiveSessionConflictError,
  SessionService,
} from '../session/session.service';
import { OcppCallHandlersService } from './ocpp-call-handlers.service';
import { PendingRequestService } from './pending-request.service';
import { validatePayload, isIncomingOcppAction } from './ocpp-validation';
import {
  isOcppCall,
  isOcppCallResult,
  isOcppCallError,
  isOcppMessageId,
} from './ocpp-message';

@Injectable()
export class OcppServerService implements OnModuleInit, OnModuleDestroy {
  private wss!: WebSocketServer;

  constructor(
    private readonly chargeStateService: ChargeStateService,
    private readonly connectionManagerService: ConnectionManagerService,
    private readonly sessionService: SessionService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly callHandlers: OcppCallHandlersService,
  ) {}

  async getActiveSession(chargePointId: string, connectorId: number) {
    return this.sessionService.findActive(chargePointId, connectorId);
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
    const response: OcppCallResult<OcppActionMap[A]['response']> = [
      OcppMessageType.CallResult,
      messageId,
      payload,
    ];

    socket.send(JSON.stringify(response));
  }

  private sendCallError(
    socket: WebSocket,
    messageId: string,
    code: OcppErrorCode,
    description: string,
  ): void {
    const response: OcppCallError = [
      OcppMessageType.CallError,
      messageId,
      code,
      description,
      {},
    ];
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
    const messageTypeId: unknown = message[0];
    switch (messageTypeId) {
      case OcppMessageType.Call:
        if (!isOcppCall(message)) {
          this.handleInvalidEnvelope(socket, message[1], true);
          return;
        }
        await this.handleCall(chargePointId, socket, message);
        return;
      case OcppMessageType.CallResult:
        if (!isOcppCallResult(message)) {
          this.handleInvalidEnvelope(socket, message[1], false);
          return;
        }
        this.handleCallResult(socket, message[1], message[2]);
        return;
      case OcppMessageType.CallError:
        if (!isOcppCallError(message)) {
          this.handleInvalidEnvelope(socket, message[1], false);
          return;
        }
        this.pendingRequestService.reject(
          message[1],
          socket,
          new BadGatewayException({
            message: 'Charger returned an OCPP error',
            errorCode: message[2],
            description: message[3],
          }),
        );
        return;
      default:
        // Section 4.1.3: ignore unknown message types without inspecting their payload.
        return;
    }
  }

  private handleInvalidEnvelope(
    socket: WebSocket,
    messageId: unknown,
    isCall: boolean,
  ): void {
    if (!isOcppMessageId(messageId)) throw new Error('Invalid OCPP message ID');
    if (isCall) {
      this.sendCallError(
        socket,
        messageId,
        'FormationViolation',
        'Invalid CALL envelope',
      );
    } else {
      this.pendingRequestService.reject(
        messageId,
        socket,
        new BadGatewayException('Invalid OCPP response envelope'),
      );
    }
  }

  private async handleCall(
    chargePointId: string,
    socket: WebSocket,
    message: OcppCallMessage,
  ): Promise<void> {
    const [, messageId, action, payload] = message;
    if (!isIncomingOcppAction(action)) {
      this.sendCallError(
        socket,
        messageId,
        'NotImplemented',
        'Unsupported action',
      );
      return;
    }
    const validationError = validatePayload(action, 'request', payload);
    if (validationError) {
      this.sendCallError(
        socket,
        messageId,
        'FormationViolation',
        'Payload does not match action schema',
      );
      console.warn(
        `${chargePointId} invalid ${action}, message ${messageId}: ${validationError}`,
      );
      return;
    }
    // The envelope, incoming action and action-specific payload have all been checked.
    const call = message as unknown as IncomingOcppCall;
    try {
      const response = await this.callHandlers.handle(chargePointId, call);
      this.sendCallResult(socket, messageId, response, action);
    } catch (error) {
      if (
        call[2] === 'StartTransaction' &&
        error instanceof ActiveSessionConflictError
      ) {
        console.warn(
          `StartTransaction conflict: ${chargePointId} connector ${call[3].connectorId}, message ${messageId}`,
        );
        this.sendCallError(
          socket,
          messageId,
          'GenericError',
          'Connector already has an active session',
        );
      } else {
        throw error;
      }
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
        this.pendingRequestService.rejectForSocket(
          socket,
          new Error('Socket Disconnected'),
        );
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
