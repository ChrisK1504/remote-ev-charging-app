import { Injectable } from '@nestjs/common';
import { ChargeStateService } from './charger-state.service';
import { SessionService } from '../session/session.service';
import {
  AuthorizeRequest,
  AuthorizeResponse,
  BootNotificationRequest,
  BootNotificationResponse,
  HeartBeatResponse,
  IncomingOcppCall,
  IncomingOcppAction,
  MeterValuesRequest,
  MeterValuesResponse,
  OcppActionMap,
  StartTransactionRequest,
  StartTransactionResponse,
  StatusNotificationRequest,
  StatusNotificationResponse,
  StopTransactionRequest,
  StopTransactionResponse,
} from './ocpp.types';

@Injectable()
export class OcppCallHandlersService {
  constructor(
    private readonly chargeStateService: ChargeStateService,
    private readonly sessionService: SessionService,
  ) {}

  // Only validated calls reach this dispatcher. No handler owns a socket or sends replies.
  handle(
    chargePointId: string,
    call: IncomingOcppCall,
  ):
    | OcppActionMap[IncomingOcppAction]['response']
    | Promise<OcppActionMap[IncomingOcppAction]['response']> {
    switch (call[2]) {
      case 'BootNotification':
        return this.bootNotification(chargePointId, call[3]);
      case 'Heartbeat':
        return this.heartbeat(chargePointId);
      case 'StatusNotification':
        return this.statusNotification(chargePointId, call[3]);
      case 'Authorize':
        return this.authorize(chargePointId, call[3]);
      case 'StartTransaction':
        return this.startTransaction(chargePointId, call[3]);
      case 'StopTransaction':
        return this.stopTransaction(chargePointId, call[3]);
      case 'MeterValues':
        return this.meterValues(chargePointId, call[3]);
      default: {
        const unhandled: never = call;
        throw new Error(`Unhandled OCPP call: ${String(unhandled)}`);
      }
    }
  }

  private bootNotification(
    chargePointId: string,
    request: BootNotificationRequest,
  ): BootNotificationResponse {
    console.log(
      `${chargePointId} BootNotification: ${JSON.stringify(request)}`,
    );
    return {
      currentTime: new Date().toISOString(),
      interval: 10,
      status: 'Accepted',
    };
  }

  private heartbeat(chargePointId: string): HeartBeatResponse {
    console.log(`${chargePointId} Heartbeat`);
    return { currentTime: new Date().toISOString() };
  }

  private statusNotification(
    chargePointId: string,
    request: StatusNotificationRequest,
  ): StatusNotificationResponse {
    console.log(
      `${chargePointId} connector ${request.connectorId}: ${request.status}`,
    );
    this.chargeStateService.updateConnector(chargePointId, {
      connectorId: request.connectorId,
      status: request.status,
      errorCode: request.errorCode,
      updatedAt: new Date(),
    });
    return {};
  }

  private authorize(
    chargePointId: string,
    request: AuthorizeRequest,
  ): AuthorizeResponse {
    console.log(`${chargePointId} Authorize: ${request.idTag}`);
    return { idTagInfo: { status: 'Accepted' } };
  }

  private async startTransaction(
    chargePointId: string,
    request: StartTransactionRequest,
  ): Promise<StartTransactionResponse> {
    console.log(
      `Start transaction from: ${chargePointId} for connector: ${request.connectorId}`,
    );
    const outcome = await this.sessionService.start({
      chargePointId,
      connectorId: request.connectorId,
      idTag: request.idTag,
      meterStart: request.meterStart,
      startedAt: new Date(request.timestamp),
    });
    return {
      transactionId: outcome.transactionId,
      idTagInfo: { status: outcome.authorizationStatus },
    };
  }

  private async stopTransaction(
    chargePointId: string,
    request: StopTransactionRequest,
  ): Promise<StopTransactionResponse> {
    console.log(
      `${chargePointId} Stop Transaction: ${JSON.stringify(request)}`,
    );
    const result = await this.sessionService.complete({
      transactionId: request.transactionId,
      chargePointId,
      endedAt: new Date(request.timestamp),
      meterStop: request.meterStop,
    });
    if (result) console.log(`Completed transaction ${request.transactionId}`);
    else
      console.log(
        `No active session matched transaction ${request.transactionId} for charger ${chargePointId}`,
      );
    return {};
  }

  private meterValues(
    chargePointId: string,
    request: MeterValuesRequest,
  ): MeterValuesResponse {
    this.chargeStateService.updateMeterValues(chargePointId, request);
    return {};
  }
}
