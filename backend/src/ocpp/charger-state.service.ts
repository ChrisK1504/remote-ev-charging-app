import { Injectable } from '@nestjs/common';
import {
  ChargePointState,
  ConnectorState,
  MeterValuesRequest,
} from './ocpp.types';

@Injectable()
export class ChargeStateService {
  private readonly chargePoints = new Map<string, ChargePointState>();

  connect(chargePointId: string): void {
    const exists = this.chargePoints.get(chargePointId);

    if (exists) {
      exists.connected = true;
      return;
    }

    this.chargePoints.set(chargePointId, {
      id: chargePointId,
      connected: true,
      connectors: new Map(),
    });
  }

  disconnect(chargePointId: string): void {
    const chargePoint = this.chargePoints.get(chargePointId);

    if (chargePoint) {
      chargePoint.connected = false;
    }
  }

  updateConnector(chargePointId: string, connectorState: ConnectorState): void {
    const chargePoint = this.chargePoints.get(chargePointId);

    if (!chargePoint) {
      console.error(`Unknown charge point: ${chargePointId}`);
      return;
    }

    chargePoint.connectors.set(connectorState.connectorId, {
      ...chargePoint.connectors.get(connectorState.connectorId),
      ...connectorState,
    });
  }

  updateMeterValues(chargePointId: string, request: MeterValuesRequest): void {
    const chargePoint = this.chargePoints.get(chargePointId);
    if (!chargePoint) return;

    const connector = chargePoint.connectors.get(request.connectorId);
    let latest = connector?.meterValue;
    for (const reading of request.meterValue) {
      if (
        !latest ||
        Date.parse(reading.timestamp) >= Date.parse(latest.timestamp)
      ) {
        latest = reading;
      }
    }
    if (!latest || latest === connector?.meterValue) return;

    chargePoint.connectors.set(request.connectorId, {
      connectorId: request.connectorId,
      status: 'Unknown',
      errorCode: 'Unknown',
      updatedAt: new Date(),
      ...connector,
      meterValue: latest,
      transactionId: request.transactionId,
    });
  }

  getAll(): ChargePointState[] {
    return Array.from(this.chargePoints.values());
  }

  get(chargePointId: string): ChargePointState | undefined {
    return this.chargePoints.get(chargePointId);
  }
}
