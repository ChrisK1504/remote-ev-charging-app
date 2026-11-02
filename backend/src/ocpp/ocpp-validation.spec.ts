import { payloadSchemas, validatePayload } from './ocpp-validation';
import { OcppActionMap } from './ocpp.types';
const timestamp = '2026-10-24T10:00:00Z';
const reading = { timestamp, sampledValue: [{ value: '12', unit: 'Wh' }] };
const requests: Record<keyof OcppActionMap, object> = {
  BootNotification: {
    chargePointVendor: 'Vendor',
    chargePointModel: 'Model',
    firmwareVersion: '1',
  },
  Heartbeat: {},
  Authorize: { idTag: 'TAG' },
  StatusNotification: {
    connectorId: 0,
    status: 'SuspendedEVSE',
    errorCode: 'EVCommunicationError',
  },
  StartTransaction: {
    connectorId: 1,
    idTag: 'TAG',
    meterStart: 0,
    timestamp,
    reservationId: 2,
  },
  StopTransaction: {
    transactionId: 1,
    meterStop: 12,
    timestamp,
    reason: 'Remote',
    transactionData: [reading],
  },
  MeterValues: { connectorId: 1, transactionId: 1, meterValue: [reading] },
  RemoteStartTransaction: { idTag: 'TAG' },
  RemoteStopTransaction: { transactionId: 1 },
};
const responses: Record<keyof OcppActionMap, object> = {
  BootNotification: {
    currentTime: timestamp,
    interval: 10,
    status: 'Accepted',
  },
  Heartbeat: { currentTime: timestamp },
  Authorize: { idTagInfo: { status: 'Accepted' } },
  StatusNotification: {},
  StartTransaction: { transactionId: 1, idTagInfo: { status: 'Accepted' } },
  StopTransaction: {},
  MeterValues: {},
  RemoteStartTransaction: { status: 'Accepted' },
  RemoteStopTransaction: { status: 'Rejected' },
};
describe('OCPP schemas', () => {
  for (const action of Object.keys(payloadSchemas) as (keyof OcppActionMap)[]) {
    for (const direction of ['request', 'response'] as const) {
      const valid = (direction === 'request' ? requests : responses)[action];
      it(`${action}.${direction} accepts valid fields`, () =>
        expect(validatePayload(action, direction, valid)).toBeUndefined());
      it.each([null, [], 'payload', { ...valid, extra: true }])(
        `${action}.${direction} rejects %j`,
        (payload) =>
          expect(validatePayload(action, direction, payload)).toBeDefined(),
      );
      for (const key of (
        payloadSchemas[action][direction] as { required: string[] }
      ).required) {
        it(`${action}.${direction} requires ${key}`, () => {
          const payload = { ...valid };
          delete payload[key];
          expect(validatePayload(action, direction, payload)).toBeDefined();
        });
      }
    }
  }
  it.each([
    { connectorId: 1.5, meterValue: [] },
    { connectorId: '1', meterValue: [] },
    {
      connectorId: 1,
      meterValue: [{ timestamp: '2026-02-30T00:00:00Z', sampledValue: [] }],
    },
    ...[
      { value: 12 },
      { value: '12', unit: 'wrong' },
      { value: '12', extra: true },
      {},
    ].map((sample) => ({
      connectorId: 1,
      meterValue: [{ timestamp, sampledValue: [sample] }],
    })),
  ])('rejects malformed MeterValues %j', (payload) =>
    expect(validatePayload('MeterValues', 'request', payload)).toBeDefined(),
  );
  it('validates optional charging profiles recursively', () => {
    const profile = {
      chargingProfileId: 1,
      stackLevel: 0,
      chargingProfilePurpose: 'TxProfile',
      chargingProfileKind: 'Relative',
      chargingSchedule: {
        chargingRateUnit: 'A',
        chargingSchedulePeriod: [{ startPeriod: 0, limit: 16.1 }],
      },
    };
    expect(
      validatePayload('RemoteStartTransaction', 'request', {
        idTag: 'TAG',
        chargingProfile: profile,
      }),
    ).toBeUndefined();
    profile.chargingSchedule.chargingSchedulePeriod[0].limit = 16.12;
    expect(
      validatePayload('RemoteStartTransaction', 'request', {
        idTag: 'TAG',
        chargingProfile: profile,
      }),
    ).toBeDefined();
  });
  it('enforces tag length', () => {
    expect(
      validatePayload('Authorize', 'request', { idTag: 'x'.repeat(20) }),
    ).toBeUndefined();
    expect(
      validatePayload('Authorize', 'request', { idTag: 'x'.repeat(21) }),
    ).toBeDefined();
  });
});
