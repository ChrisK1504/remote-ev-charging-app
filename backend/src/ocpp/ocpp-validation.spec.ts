import { UserService } from '../users/user.service';
import { OcppCallHandlersService } from './ocpp-call-handlers.service';
import { payloadSchemas, validatePayload } from './ocpp-validation';
import { OcppActionMap } from './ocpp.types';
import { OcppServerService } from './ocpp-server.service';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerService } from './connection-manager.service';
import { PendingRequestService } from './pending-request.service';
import { SessionService } from '../session/session.service';
import { WebSocket } from 'ws';
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
describe('OCPP validation boundary', () => {
  function setup() {
    const states = new ChargeStateService();
    states.connect('CP');
    const sessions = { start: jest.fn(), complete: jest.fn() };
    const connections = new ConnectionManagerService();
    const send = jest.fn();
    const socket = { send, readyState: WebSocket.OPEN } as unknown as WebSocket;
    connections.add('CP', socket);
    const service = new OcppServerService(
      states,
      connections,
      sessions as unknown as SessionService,
      new PendingRequestService(),
      new OcppCallHandlersService(
        states,
        sessions as unknown as SessionService,
        { findByIdTag: jest.fn() } as unknown as UserService,
      ),
    );
    return { service, states, sessions, send, socket };
  }
  it.each([
    'BootNotification',
    'Heartbeat',
    'Authorize',
    'StatusNotification',
    'StartTransaction',
    'StopTransaction',
    'MeterValues',
  ])('rejects invalid %s before side effects', async (action) => {
    const { service, states, sessions, socket, send } = setup();
    await service['handleMessage'](
      'CP',
      socket,
      JSON.stringify([2, 'bad', action, { extra: true }]),
    );
    expect(JSON.parse(send.mock.calls[0][0])).toEqual([
      4,
      'bad',
      'FormationViolation',
      expect.any(String),
      {},
    ]);
    expect(sessions.start).not.toHaveBeenCalled();
    expect(sessions.complete).not.toHaveBeenCalled();
    expect(states.get('CP')?.connectors.size).toBe(0);
  });
  it.each([
    [2, 'id', 'Heartbeat'],
    [2, 'id', 'Heartbeat', {}, 'extra'],
    [2, 'id', 'Heartbeat', null],
    [2, 'id', 42, {}],
  ])('returns a correlated error for malformed CALL %j', async (...frame) => {
    const { service, socket, send } = setup();
    await service['handleMessage']('CP', socket, JSON.stringify(frame));
    expect(JSON.parse(send.mock.calls[0][0])).toEqual([
      4,
      'id',
      'FormationViolation',
      expect.any(String),
      {},
    ]);
  });
  it.each([
    '{',
    '{}',
    '[2,"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "Heartbeat",{}]',
  ])('rejects unprocessable frame %s', async (raw) => {
    const { service, socket, send } = setup();
    await expect(service['handleMessage']('CP', socket, raw)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('ignores unknown message types without inspecting their payload', async () => {
    const { service, socket, send, states, sessions } = setup();
    await service['handleMessage'](
      'CP',
      socket,
      JSON.stringify([9, null, 'bad payload']),
    );
    expect(send).not.toHaveBeenCalled();
    expect(states.get('CP')?.connectors.size).toBe(0);
    expect(sessions.start).not.toHaveBeenCalled();
  });
  it('responds to unsupported actions', async () => {
    const { service, socket, send } = setup();
    await service['handleMessage'](
      'CP',
      socket,
      JSON.stringify([2, 'id', 'Reset', {}]),
    );
    expect(JSON.parse(send.mock.calls[0][0])[2]).toBe('NotImplemented');
  });
  it('preserves valid meter handling', async () => {
    const { service, socket, send, states } = setup();
    await service['handleMessage'](
      'CP',
      socket,
      JSON.stringify([2, 'id', 'MeterValues', requests.MeterValues]),
    );
    expect(states.get('CP')?.connectors.get(1)?.meterValue).toEqual(reading);
    expect(send).toHaveBeenCalledWith(JSON.stringify([3, 'id', {}]));
  });
  it('validates generated responses before sending them', () => {
    const { service, socket, send } = setup();
    expect(() =>
      service['sendCallResult'](
        socket,
        'id',
        { currentTime: 'bad-date' },
        'Heartbeat',
      ),
    ).toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects outgoing invalid payload without sending', async () => {
    const { service, send } = setup();
    await expect(
      service.remoteStartTransaction('CP', { idTag: 'x'.repeat(21) }),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it.each([
    [3, { status: 'Wrong' }],
    [3, null],
    [4, 'GenericError', 'error', []],
    [4, 'Wrong', 'error', {}],
  ])('rejects malformed response %j', async (type, ...body) => {
    jest.useFakeTimers();
    try {
      const { service, socket, send } = setup();
      const command = service.remoteStopTransaction('CP', { transactionId: 1 });
      const rejection = expect(command).rejects.toThrow();
      const id = JSON.parse(send.mock.calls[0][0])[1];
      let settled = false;
      void command.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      const foreignSocket = { send: jest.fn() } as unknown as WebSocket;
      await service['handleMessage'](
        'OTHER',
        foreignSocket,
        JSON.stringify([type, id, ...body]),
      );
      expect(settled).toBe(false);
      await service['handleMessage'](
        'CP',
        socket,
        JSON.stringify([type, id, ...body]),
      );
      await rejection;
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
