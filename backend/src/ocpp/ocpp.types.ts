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

export interface RemoteStartTransactionRequest {
  // CMS -> CP
  idTag: string;
}

export interface RemoteStartTransactionResponse {
  status: string; // Should become an enum
}

export interface StartTransactionRequest {
  connectorId: number;
  idTag: string;
  meterStart: number;
  timeStamp: Date;
}

export interface StartTransactionTag {
  status: string; // should be enum
  transactionId: number;
}

export interface StartTransactionResponse {
  idTagInfo: StartTransactionTag;
}
