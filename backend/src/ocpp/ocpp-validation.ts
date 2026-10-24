import Ajv from 'ajv';
import { OcppActionMap } from './ocpp.types';

// Local JSON Schema definitions transcribed from OCPP 1.6J edition 2 Core:
// https://ocpp.md/ocpp-1.6j/schemas/core/
// These enforce wire constraints, not additional business rules.
const object = (
  properties: Record<string, object>,
  required: string[] = [],
) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const string = (maxLength?: number) => ({
  type: 'string',
  ...(maxLength === undefined ? {} : { maxLength }),
});
const enumeration = (...values: string[]) => ({ type: 'string', enum: values });
const integer = { type: 'integer' };
const dateTime = { type: 'string', format: 'date-time' };
const array = (items: object) => ({ type: 'array', items });
const tagInfo = object(
  {
    status: enumeration(
      'Accepted',
      'Blocked',
      'Expired',
      'Invalid',
      'ConcurrentTx',
    ),
    expiryDate: dateTime,
    parentIdTag: string(20),
  },
  ['status'],
);
const sampledValue = object(
  {
    value: string(),
    context: enumeration(
      'Interruption.Begin',
      'Interruption.End',
      'Sample.Clock',
      'Sample.Periodic',
      'Transaction.Begin',
      'Transaction.End',
      'Trigger',
      'Other',
    ),
    format: enumeration('Raw', 'SignedData'),
    measurand: enumeration(
      'Energy.Active.Export.Register',
      'Energy.Active.Import.Register',
      'Energy.Reactive.Export.Register',
      'Energy.Reactive.Import.Register',
      'Energy.Active.Export.Interval',
      'Energy.Active.Import.Interval',
      'Energy.Reactive.Export.Interval',
      'Energy.Reactive.Import.Interval',
      'Power.Active.Export',
      'Power.Active.Import',
      'Power.Offered',
      'Power.Reactive.Export',
      'Power.Reactive.Import',
      'Power.Factor',
      'Current.Import',
      'Current.Export',
      'Current.Offered',
      'Voltage',
      'Frequency',
      'Temperature',
      'SoC',
      'RPM',
    ),
    phase: enumeration(
      'L1',
      'L2',
      'L3',
      'N',
      'L1-N',
      'L2-N',
      'L3-N',
      'L1-L2',
      'L2-L3',
      'L3-L1',
    ),
    location: enumeration('Cable', 'EV', 'Inlet', 'Outlet', 'Body'),
    unit: enumeration(
      'Wh',
      'kWh',
      'varh',
      'kvarh',
      'W',
      'kW',
      'VA',
      'kVA',
      'var',
      'kvar',
      'A',
      'V',
      'K',
      'Celcius',
      'Celsius',
      'Fahrenheit',
      'Percent',
    ),
  },
  ['value'],
);
const meterValue = object(
  { timestamp: dateTime, sampledValue: array(sampledValue) },
  ['timestamp', 'sampledValue'],
);
const chargingProfile = object(
  {
    chargingProfileId: integer,
    transactionId: integer,
    stackLevel: integer,
    chargingProfilePurpose: enumeration(
      'ChargePointMaxProfile',
      'TxDefaultProfile',
      'TxProfile',
    ),
    chargingProfileKind: enumeration('Absolute', 'Recurring', 'Relative'),
    recurrencyKind: enumeration('Daily', 'Weekly'),
    validFrom: dateTime,
    validTo: dateTime,
    chargingSchedule: object(
      {
        duration: integer,
        startSchedule: dateTime,
        chargingRateUnit: enumeration('A', 'W'),
        chargingSchedulePeriod: array(
          object(
            {
              startPeriod: integer,
              limit: { type: 'number', multipleOf: 0.1 },
              numberPhases: integer,
            },
            ['startPeriod', 'limit'],
          ),
        ),
        minChargingRate: { type: 'number', multipleOf: 0.1 },
      },
      ['chargingRateUnit', 'chargingSchedulePeriod'],
    ),
  },
  [
    'chargingProfileId',
    'stackLevel',
    'chargingProfilePurpose',
    'chargingProfileKind',
    'chargingSchedule',
  ],
);

export const payloadSchemas = {
  BootNotification: {
    request: object(
      {
        chargePointVendor: string(20),
        chargePointModel: string(20),
        chargePointSerialNumber: string(25),
        chargeBoxSerialNumber: string(25),
        firmwareVersion: string(50),
        iccid: string(20),
        imsi: string(20),
        meterType: string(25),
        meterSerialNumber: string(25),
      },
      ['chargePointVendor', 'chargePointModel'],
    ),
    response: object(
      {
        status: enumeration('Accepted', 'Pending', 'Rejected'),
        currentTime: dateTime,
        interval: integer,
      },
      ['status', 'currentTime', 'interval'],
    ),
  },
  Heartbeat: {
    request: object({}),
    response: object({ currentTime: dateTime }, ['currentTime']),
  },
  Authorize: {
    request: object({ idTag: string(20) }, ['idTag']),
    response: object({ idTagInfo: tagInfo }, ['idTagInfo']),
  },
  StatusNotification: {
    request: object(
      {
        connectorId: integer,
        errorCode: enumeration(
          'ConnectorLockFailure',
          'EVCommunicationError',
          'GroundFailure',
          'HighTemperature',
          'InternalError',
          'LocalListConflict',
          'NoError',
          'OtherError',
          'OverCurrentFailure',
          'PowerMeterFailure',
          'PowerSwitchFailure',
          'ReaderFailure',
          'ResetFailure',
          'UnderVoltage',
          'OverVoltage',
          'WeakSignal',
        ),
        status: enumeration(
          'Available',
          'Preparing',
          'Charging',
          'SuspendedEVSE',
          'SuspendedEV',
          'Finishing',
          'Reserved',
          'Unavailable',
          'Faulted',
        ),
        info: string(50),
        timestamp: dateTime,
        vendorId: string(255),
        vendorErrorCode: string(50),
      },
      ['connectorId', 'errorCode', 'status'],
    ),
    response: object({}),
  },
  StartTransaction: {
    request: object(
      {
        connectorId: integer,
        idTag: string(20),
        meterStart: integer,
        timestamp: dateTime,
        reservationId: integer,
      },
      ['connectorId', 'idTag', 'meterStart', 'timestamp'],
    ),
    response: object({ transactionId: integer, idTagInfo: tagInfo }, [
      'transactionId',
      'idTagInfo',
    ]),
  },
  StopTransaction: {
    request: object(
      {
        meterStop: integer,
        timestamp: dateTime,
        transactionId: integer,
        idTag: string(20),
        reason: enumeration(
          'EmergencyStop',
          'EVDisconnected',
          'HardReset',
          'Local',
          'Other',
          'PowerLoss',
          'Reboot',
          'Remote',
          'SoftReset',
          'UnlockCommand',
          'DeAuthorized',
        ),
        transactionData: array(meterValue),
      },
      ['meterStop', 'timestamp', 'transactionId'],
    ),
    response: object({ idTagInfo: tagInfo }),
  },
  MeterValues: {
    request: object(
      {
        connectorId: integer,
        transactionId: integer,
        meterValue: array(meterValue),
      },
      ['connectorId', 'meterValue'],
    ),
    response: object({}),
  },
  RemoteStartTransaction: {
    request: object(
      { idTag: string(20), connectorId: integer, chargingProfile },
      ['idTag'],
    ),
    response: object({ status: enumeration('Accepted', 'Rejected') }, [
      'status',
    ]),
  },
  RemoteStopTransaction: {
    request: object({ transactionId: integer }, ['transactionId']),
    response: object({ status: enumeration('Accepted', 'Rejected') }, [
      'status',
    ]),
  },
} satisfies Record<keyof OcppActionMap, { request: object; response: object }>;

const ajv = new Ajv({
  allErrors: true,
  format: 'full',
  multipleOfPrecision: 12,
});
const validators = new Map<string, Ajv.ValidateFunction>();
for (const [action, schemas] of Object.entries(payloadSchemas)) {
  for (const direction of ['request', 'response'] as const) {
    validators.set(`${action}.${direction}`, ajv.compile(schemas[direction]));
  }
}

export function isOcppAction(action: unknown): action is keyof OcppActionMap {
  return typeof action === 'string' && Object.hasOwn(payloadSchemas, action);
}

export function validatePayload(
  action: keyof OcppActionMap,
  direction: 'request' | 'response',
  payload: unknown,
): string | undefined {
  const validate = validators.get(`${action}.${direction}`)!;
  return validate(payload) ? undefined : ajv.errorsText(validate.errors);
}

export const incomingActions = new Set<string>([
  'BootNotification',
  'Heartbeat',
  'Authorize',
  'StatusNotification',
  'StartTransaction',
  'StopTransaction',
  'MeterValues',
]);
