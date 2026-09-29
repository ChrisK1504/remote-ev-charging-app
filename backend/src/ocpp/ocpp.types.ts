export interface ConnectorState {
  connectorId: number;
  status: string; // Should become an enum
  errorCode: string; // Also an enum
  updatedAt: Date;
}

export interface ChargePointState {
  id: string;
  connected: boolean;
  connectors: Map<number, ConnectorState>;
}

export interface StatusNotificationRequest {
  connectorId: number;
  errorCode: string; // should be an enum
  status: string; // should be an enum
}
