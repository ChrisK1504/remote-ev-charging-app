export enum OcppMessageType {
  Call = 2,
  CallResult = 3,
  CallError = 4,
}

export type OcppCall<A extends keyof OcppActionMap> = [
  OcppMessageType.Call,
  string,
  A,
  OcppActionMap[A]['request'],
];

export type OcppCallResult<T> = [OcppMessageType.CallResult, string, T];

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

export interface BootNotificationRequest {
  chargePointModel: string;
  chargePointVendor: string;
}

export interface BootNotificationResponse {
  currentTime: string;
  interval: number;
  status: 'Accepted' | 'Pending' | 'Rejected'; // Should be an enum
}

export type HeartbeatRequest = {};

export interface HeartBeatResponse {
  currentTime: string;
}

export interface AuthorizeRequest {
  idTag: string;
}

export interface AuthorizeTagInfo {
  status: 'Accepted' | 'Blocked' | 'Expired' | 'Invalid' | 'ConcurrentTx';
}

export interface AuthorizeResponse {
  idTagInfo: AuthorizeTagInfo;
}

export interface StatusNotificationRequest {
  connectorId: number;
  errorCode: 'NoError' | 'ConnectorLockFailure' | 'WeakSignal'; // More Options
  status: 'Available' | 'Preparing' | 'Charging' | 'Unavailable' | 'Faulted'; // More Options
}

export type StatusNotificationResponse = {};

export interface RemoteStartTransactionRequest {
  idTag: string;
  connectorId?: number;
}

export interface RemoteStartTransactionResponse {
  status: 'Accepted' | 'Rejected';
}

export interface StartTransactionRequest {
  connectorId: number;
  idTag: string;
  meterStart: number;
  timeStamp: string;
}

export interface StartTransactionTag {
  status: 'Accepted' | 'Blocked' | 'Expired' | 'Invalid' | 'ConcurrentTx';
  transactionId: number;
}

export interface StartTransactionResponse {
  idTagInfo: StartTransactionTag;
}

export interface OcppActionMap {
  BootNotification: {
    request: BootNotificationRequest;
    response: BootNotificationResponse;
  };

  RemoteStartTransaction: {
    request: RemoteStartTransactionRequest;
    response: RemoteStartTransactionResponse;
  };

  Heartbeat: {
    request: HeartbeatRequest;
    response: HeartBeatResponse;
  };

  Authorize: {
    request: AuthorizeRequest;
    response: AuthorizeResponse;
  };

  StatusNotification: {
    request: StatusNotificationRequest;
    response: StatusNotificationResponse;
  };

  StartTransaction: {
    request: StartTransactionRequest;
    response: StartTransactionResponse;
  };
}
