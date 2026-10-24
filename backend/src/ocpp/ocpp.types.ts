export enum OcppMessageType {
  Call = 2,
  CallResult = 3,
  CallError = 4,
}

// Envelope types describe framing only; action payloads need separate validation.
export type OcppPayload = Record<string, unknown> | null;
export type OcppCallMessage = [
  messageType: OcppMessageType.Call,
  messageId: string,
  action: string,
  payload: OcppPayload,
];

// Preserve action-specific typing for calls constructed by this backend.
export type OcppCall<A extends keyof OcppActionMap> = [
  OcppMessageType.Call,
  string,
  A,
  OcppActionMap[A]['request'],
];

export const INCOMING_OCPP_ACTIONS = [
  'BootNotification',
  'Heartbeat',
  'StatusNotification',
  'Authorize',
  'StartTransaction',
  'StopTransaction',
  'MeterValues',
] as const satisfies readonly (keyof OcppActionMap)[];
export type IncomingOcppAction = (typeof INCOMING_OCPP_ACTIONS)[number];
export type IncomingOcppCall = {
  [A in IncomingOcppAction]: OcppCall<A>;
}[IncomingOcppAction];

export type OcppCallResult<T = OcppPayload> = [
  messageType: OcppMessageType.CallResult,
  messageId: string,
  payload: T,
];

export const OCPP_ERROR_CODES = [
  'NotImplemented',
  'NotSupported',
  'InternalError',
  'ProtocolError',
  'SecurityError',
  'FormationViolation',
  'PropertyConstraintViolation',
  'OccurenceConstraintViolation',
  'TypeConstraintViolation',
  'GenericError',
] as const;
export type OcppErrorCode = (typeof OCPP_ERROR_CODES)[number];

export type OcppCallError = [
  messageType: OcppMessageType.CallError,
  messageId: string,
  errorCode: OcppErrorCode,
  errorDescription: string,
  errorDetails: Record<string, unknown>,
];
export type OcppMessage = OcppCallMessage | OcppCallResult | OcppCallError;

export interface ConnectorState {
  connectorId: number;
  status: string; // Should become an enum
  errorCode: string; // Also an enum
  updatedAt: Date;
  meterValue?: MeterValue;
  transactionId?: number;
}

export interface ChargePointState {
  id: string;
  connected: boolean;
  connectors: Map<number, ConnectorState>;
}

export interface BootNotificationRequest {
  chargePointModel: string;
  chargePointVendor: string;
  chargePointSerialNumber?: string;
  chargeBoxSerialNumber?: string;
  firmwareVersion?: string;
  iccid?: string;
  imsi?: string;
  meterType?: string;
  meterSerialNumber?: string;
}

export interface BootNotificationResponse {
  currentTime: string;
  interval: number;
  status: 'Accepted' | 'Pending' | 'Rejected'; // Should be an enum
}

export type HeartbeatRequest = Record<string, never>;

export interface HeartBeatResponse {
  currentTime: string;
}

export interface AuthorizeRequest {
  idTag: string;
}

export interface AuthorizeTagInfo {
  status: 'Accepted' | 'Blocked' | 'Expired' | 'Invalid' | 'ConcurrentTx';
  expiryDate?: string;
  parentIdTag?: string;
}

export interface AuthorizeResponse {
  idTagInfo: AuthorizeTagInfo;
}

export interface StatusNotificationRequest {
  connectorId: number;
  errorCode:
    | 'ConnectorLockFailure'
    | 'EVCommunicationError'
    | 'GroundFailure'
    | 'HighTemperature'
    | 'InternalError'
    | 'LocalListConflict'
    | 'NoError'
    | 'OtherError'
    | 'OverCurrentFailure'
    | 'PowerMeterFailure'
    | 'PowerSwitchFailure'
    | 'ReaderFailure'
    | 'ResetFailure'
    | 'UnderVoltage'
    | 'OverVoltage'
    | 'WeakSignal';
  status:
    | 'Available'
    | 'Preparing'
    | 'Charging'
    | 'SuspendedEVSE'
    | 'SuspendedEV'
    | 'Finishing'
    | 'Reserved'
    | 'Unavailable'
    | 'Faulted';
  info?: string;
  timestamp?: string;
  vendorId?: string;
  vendorErrorCode?: string;
}

export type StatusNotificationResponse = Record<string, never>;

export interface SampledValue {
  value: string;
  context?:
    | 'Interruption.Begin'
    | 'Interruption.End'
    | 'Sample.Clock'
    | 'Sample.Periodic'
    | 'Transaction.Begin'
    | 'Transaction.End'
    | 'Trigger'
    | 'Other';
  format?: 'Raw' | 'SignedData';
  measurand?:
    | 'Energy.Active.Export.Register'
    | 'Energy.Active.Import.Register'
    | 'Energy.Reactive.Export.Register'
    | 'Energy.Reactive.Import.Register'
    | 'Energy.Active.Export.Interval'
    | 'Energy.Active.Import.Interval'
    | 'Energy.Reactive.Export.Interval'
    | 'Energy.Reactive.Import.Interval'
    | 'Power.Active.Export'
    | 'Power.Active.Import'
    | 'Power.Offered'
    | 'Power.Reactive.Export'
    | 'Power.Reactive.Import'
    | 'Power.Factor'
    | 'Current.Import'
    | 'Current.Export'
    | 'Current.Offered'
    | 'Voltage'
    | 'Frequency'
    | 'Temperature'
    | 'SoC'
    | 'RPM';
  unit?:
    | 'Wh'
    | 'kWh'
    | 'varh'
    | 'kvarh'
    | 'W'
    | 'kW'
    | 'VA'
    | 'kVA'
    | 'var'
    | 'kvar'
    | 'A'
    | 'V'
    | 'K'
    | 'Celcius'
    | 'Celsius'
    | 'Fahrenheit'
    | 'Percent';
  phase?:
    | 'L1'
    | 'L2'
    | 'L3'
    | 'N'
    | 'L1-N'
    | 'L2-N'
    | 'L3-N'
    | 'L1-L2'
    | 'L2-L3'
    | 'L3-L1';
  location?: 'Cable' | 'EV' | 'Inlet' | 'Outlet' | 'Body';
}

export interface MeterValue {
  timestamp: string;
  sampledValue: SampledValue[];
}

export interface MeterValuesRequest {
  connectorId: number;
  meterValue: MeterValue[];
  transactionId?: number;
}

export type MeterValuesResponse = Record<string, never>;

export interface ChargingProfile {
  chargingProfileId: number;
  transactionId?: number;
  stackLevel: number;
  chargingProfilePurpose:
    'ChargePointMaxProfile' | 'TxDefaultProfile' | 'TxProfile';
  chargingProfileKind: 'Absolute' | 'Recurring' | 'Relative';
  recurrencyKind?: 'Daily' | 'Weekly';
  validFrom?: string;
  validTo?: string;
  chargingSchedule: {
    duration?: number;
    startSchedule?: string;
    chargingRateUnit: 'A' | 'W';
    chargingSchedulePeriod: {
      startPeriod: number;
      limit: number;
      numberPhases?: number;
    }[];
    minChargingRate?: number;
  };
}

export interface RemoteStartTransactionRequest {
  idTag: string;
  connectorId?: number;
  chargingProfile?: ChargingProfile;
}

export interface RemoteStartTransactionResponse {
  status: 'Accepted' | 'Rejected';
}

export interface StartTransactionRequest {
  connectorId: number;
  idTag: string;
  meterStart: number;
  timestamp: string;
  reservationId?: number;
}

export interface StartTransactionTag {
  status: 'Accepted' | 'Blocked' | 'Expired' | 'Invalid' | 'ConcurrentTx';
  expiryDate?: string;
  parentIdTag?: string;
}

export interface StartTransactionResponse {
  transactionId: number;
  idTagInfo: StartTransactionTag;
}

export interface RemoteStopTransactionRequest {
  transactionId: number;
}

export interface RemoteStopTransactionResponse {
  status: 'Accepted' | 'Rejected';
}

export interface StopTransactionRequest {
  idTag?: string;
  reason?:
    | 'EmergencyStop'
    | 'EVDisconnected'
    | 'HardReset'
    | 'Local'
    | 'Other'
    | 'PowerLoss'
    | 'Reboot'
    | 'Remote'
    | 'SoftReset'
    | 'UnlockCommand'
    | 'DeAuthorized';
  transactionData?: MeterValue[];
  meterStop: number;
  timestamp: string;
  transactionId: number;
}
export interface StopTransactionResponse {
  idTagInfo?: AuthorizeTagInfo;
}

export interface OcppActionMap {
  MeterValues: {
    request: MeterValuesRequest;
    response: MeterValuesResponse;
  };

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

  RemoteStopTransaction: {
    request: RemoteStopTransactionRequest;
    response: RemoteStopTransactionResponse;
  };

  StopTransaction: {
    request: StopTransactionRequest;
    response: StopTransactionResponse;
  };
}
