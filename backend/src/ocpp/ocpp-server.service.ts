import {
  BadGatewayException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WebSocket, WebSocketServer } from 'ws';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerServie } from './connection-manager.service';
import { randomUUID } from 'crypto';
import {
  ActiveTransaction,
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

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  socket: WebSocket;
}

@Injectable()
export class OcppServerService implements OnModuleInit, OnModuleDestroy {
  private wss!: WebSocketServer;
  private transactionId: number = 0;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly transactions = new Map<number, ActiveTransaction>();

  constructor(
    private readonly chargeStateService: ChargeStateService,
    private readonly connectionManagerService: ConnectionManagerServie,
  ) {}

  getActiveTransaction(chargePointId: string, connectorId: number) {
    console.log(this.transactions.values());
    const transaction = [...this.transactions.values()].find(
      (transaction) =>
        transaction.chargePointId === chargePointId &&
        transaction.connectorId === connectorId,
    );
    console.log(transaction);
    return transaction;
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

    return new Promise<OcppActionMap[A]['response']>((resolve, reject) => {
      this.pendingRequests.set(messageId, {
        resolve: (payload: unknown): void => {
          resolve(payload as OcppActionMap[A]['response']);
        },
        reject,
        socket,
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
    const pending = this.pendingRequests.get(messageId);

    if (!pending || pending.socket !== socket) {
      console.warn(`No pending requests for ${messageId}`);
      return;
    }

    this.pendingRequests.delete(messageId);
    pending.resolve(payload);
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

            const transactionId = this.transactionId++;
            this.transactions.set(this.transactionId, {
              transactionId: transactionId,
              chargePointId: chargePointId,
              connectorId: request.connectorId,
              idTag: request.idTag,
              meterStart: request.meterStart,
              startedAt: request.timestamp,
            });

            console.log(this.transactions.values());

            console.log(
              `Start transaction from: ${chargePointId} for connector: ${request.connectorId}`,
            );

            const response: StartTransactionResponse = {
              transactionId: transactionId,
              idTagInfo: {
                status: 'Accepted',
              },
            };

            this.sendCallResult(socket, messageId, response);
          }
          break;
        case 'StopTransaction':
          {
            const request: StopTransactionRequest =
              payload as StopTransactionRequest;
            console.log(
              `${chargePointId} Stop Transaction: ${JSON.stringify(request)}`,
            );

            this.transactions.delete(request.transactionId);
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
      const pending = this.pendingRequests.get(messageId);
      if (pending?.socket === socket) {
        this.pendingRequests.delete(messageId);
        pending.reject(
          new BadGatewayException({
            message: 'Charger returned an OCPP error',
            errorCode: actionOrPayload,
            description: payload,
          }),
        );
      }
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
