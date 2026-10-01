import { Injectable } from '@nestjs/common';
import { ChargePointState, ConnectorState } from './ocpp.types';

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

    chargePoint.connectors.set(connectorState.connectorId, connectorState);
  }

  getAll(): ChargePointState[] {
    return Array.from(this.chargePoints.values());
  }

  get(chargePointId: string): ChargePointState | undefined {
    return this.chargePoints.get(chargePointId);
  }
}
