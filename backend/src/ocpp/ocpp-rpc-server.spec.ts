import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createRPCError, RPCClient, RPCServer, TimeoutError } from 'ocpp-rpc';
import { ChargerService } from './charger.service';
import { OcppRpcServerService } from './ocpp-rpc-server.service';
import { EventEmitter } from 'stream';
import { UserService } from '../users/user.service';
import { RpcConnectionManagerService } from './rpc-connection-manager.service';
import { ChargeStateService } from './charger-state.service';
import {
  ActiveSessionConflictError,
  SessionService,
} from '../session/session.service';

jest.mock('ocpp-rpc', () => ({
  ...jest.requireActual('ocpp-rpc'),
  RPCServer: jest.fn(),
}));

describe('Ocpp-RPC Server Service', () => {
  describe('RPC remote commands', () => {
    let service: OcppRpcServerService;
    let client: { state: number; call: jest.Mock };
    let get: jest.Mock;
    const findActive = jest.fn();

    beforeEach(() => {
      client = { state: RPCClient.OPEN, call: jest.fn() };
      get = jest.fn().mockReturnValue(client);
      findActive.mockReset();
      service = new OcppRpcServerService(
        {} as ChargerService,
        {} as UserService,
        { get } as unknown as RpcConnectionManagerService,
        new ChargeStateService(),
        { findActive } as unknown as SessionService,
      );
    });

    const cases = [
      {
        method: 'remoteStartTransaction',
        action: 'RemoteStartTransaction',
        payload: { idTag: 'TEST', connectorId: 2 },
      },
      {
        method: 'remoteStopTransaction',
        action: 'RemoteStopTransaction',
        payload: { transactionId: 42 },
      },
    ] as const;

    describe.each(cases)('$action', ({ method, action, payload }) => {
      const send = (service: OcppRpcServerService) =>
        method === 'remoteStartTransaction'
          ? service.remoteStartTransaction('CP_TEST', {
              idTag: 'TEST',
              connectorId: 2,
            })
          : service.remoteStopTransaction('CP_TEST', { transactionId: 42 });

      it.each(['Accepted', 'Rejected'])(
        'returns %s without interpreting it as a physical outcome',
        async (status) => {
          client.call.mockResolvedValue({ status });
          await expect(send(service)).resolves.toEqual({ status });
          expect(get).toHaveBeenCalledWith('CP_TEST');
          expect(client.call).toHaveBeenCalledTimes(1);
          expect(client.call).toHaveBeenCalledWith(action, payload, {
            callTimeoutMs: 10000,
          });
        },
      );

      it('rejects a missing connection', async () => {
        get.mockReturnValue(undefined);
        await expect(send(service)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        expect(client.call).not.toHaveBeenCalled();
      });

      it('rejects a closing connection', async () => {
        client.state = RPCClient.CLOSING;
        await expect(send(service)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        expect(client.call).not.toHaveBeenCalled();
      });

      it('waits for the RPC response', async () => {
        let finish!: (result: { status: string }) => void;
        client.call.mockReturnValue(
          new Promise((resolve) => {
            finish = resolve;
          }),
        );
        let settled = false;
        const response = send(service).then((result) => {
          settled = true;
          return result;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        finish({ status: 'Accepted' });
        await expect(response).resolves.toEqual({ status: 'Accepted' });
      });

      it('maps CALLERROR to HTTP 502', async () => {
        client.call.mockRejectedValue(
          createRPCError('NotSupported', 'Unsupported command'),
        );
        await expect(send(service)).rejects.toMatchObject({
          status: 502,
          response: {
            errorCode: 'NotSupported',
            description: 'Unsupported command',
          },
        });
      });

      it('maps timeout to HTTP 504 without retrying', async () => {
        client.call.mockRejectedValue(new TimeoutError('Call timeout'));
        await expect(send(service)).rejects.toBeInstanceOf(
          GatewayTimeoutException,
        );
        expect(client.call).toHaveBeenCalledTimes(1);
      });

      it('maps disconnect during a call to HTTP 503', async () => {
        client.call.mockImplementation(async () => {
          client.state = RPCClient.CLOSED;
          throw new Error('Client disconnected');
        });
        await expect(send(service)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
      });

      it('does not retry a failed call on a replacement connection', async () => {
        const replacement = { state: RPCClient.OPEN, call: jest.fn() };
        client.call.mockImplementation(async () => {
          get.mockReturnValue(replacement);
          throw new Error('Client disconnected');
        });
        await expect(send(service)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        expect(replacement.call).not.toHaveBeenCalled();
      });

      it('maps unexpected communication failure to HTTP 502', async () => {
        client.call.mockRejectedValue(new Error('Send failed'));
        await expect(send(service)).rejects.toBeInstanceOf(BadGatewayException);
      });

      it('rejects an invalid response', async () => {
        client.call.mockResolvedValue({ status: 'Charging' });
        await expect(send(service)).rejects.toBeInstanceOf(BadGatewayException);
      });
    });

    it('rejects invalid start and stop payloads before dispatch', async () => {
      await expect(
        service.remoteStartTransaction('CP_TEST', { idTag: 'x'.repeat(21) }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.remoteStopTransaction('CP_TEST', { transactionId: 1.5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.call).not.toHaveBeenCalled();
    });

    it('delegates active-session lookup to persistence', async () => {
      const session = { transactionId: 42, userId: 'owner' };
      findActive.mockResolvedValue(session);
      await expect(service.getActiveSession('CP_TEST', 2)).resolves.toBe(
        session,
      );
      expect(findActive).toHaveBeenCalledWith('CP_TEST', 2);
    });
  });

  describe('MeterValues', () => {
    let server: EventEmitter;
    let state: ChargeStateService;
    let service: OcppRpcServerService;
    const reading = (timestamp: string, value: string) => ({
      timestamp,
      sampledValue: [{ value }],
    });

    function connect(identity = 'CP_METER') {
      const client = Object.assign(new EventEmitter(), {
        identity,
        session: { sessionId: 'test' },
        handle: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      });
      server.emit('client', client);
      const registration = client.handle.mock.calls.find(
        ([method]) => method === 'MeterValues',
      );
      expect(registration).toBeDefined();
      return { client, meterValues: registration![1] };
    }

    beforeEach(async () => {
      const transport = Object.assign(new EventEmitter(), {
        auth: jest.fn(),
        listen: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      });
      server = transport;
      jest
        .mocked(RPCServer)
        .mockImplementation(() => transport as unknown as RPCServer);
      state = new ChargeStateService();
      service = new OcppRpcServerService(
        {} as ChargerService,
        {} as UserService,
        new RpcConnectionManagerService(),
        state,
        {} as SessionService,
      );
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('acknowledges readings before status and creates an Unknown connector with the latest sample', () => {
      const { meterValues } = connect();
      connect('CP_OTHER');
      const latest = reading('2026-11-02T10:02:00Z', '200');

      expect(
        meterValues({
          params: {
            connectorId: 1,
            transactionId: 42,
            meterValue: [latest, reading('2026-11-02T10:01:00Z', '100')],
          },
        }),
      ).toEqual({});

      expect(state.get('CP_METER')!.connectors.get(1)).toMatchObject({
        connectorId: 1,
        status: 'Unknown',
        errorCode: 'Unknown',
        transactionId: 42,
        meterValue: latest,
      });
      expect(state.get('CP_OTHER')!.connectors.size).toBe(0);
    });

    it('preserves status, ignores older readings, and isolates connectors', () => {
      const { meterValues } = connect();
      const updatedAt = new Date('2026-11-02T10:00:00Z');
      state.updateConnector('CP_METER', {
        connectorId: 1,
        status: 'Charging',
        errorCode: 'NoError',
        updatedAt,
      });
      const latest = reading('2026-11-02T10:02:00Z', '200');
      meterValues({
        params: { connectorId: 1, transactionId: 42, meterValue: [latest] },
      });
      expect(
        meterValues({
          params: {
            connectorId: 1,
            transactionId: 99,
            meterValue: [reading('2026-11-02T10:01:00Z', '100')],
          },
        }),
      ).toEqual({});
      const otherReading = reading('2026-11-02T10:03:00Z', '300');
      meterValues({ params: { connectorId: 2, meterValue: [otherReading] } });

      expect(state.get('CP_METER')!.connectors.get(1)).toMatchObject({
        status: 'Charging',
        errorCode: 'NoError',
        updatedAt,
        transactionId: 42,
        meterValue: latest,
      });
      expect(state.get('CP_METER')!.connectors.get(2)).toMatchObject({
        meterValue: otherReading,
        transactionId: undefined,
      });
    });

    it('preserves the existing equal-timestamp replacement policy', () => {
      const { meterValues } = connect();
      const timestamp = '2026-11-02T10:00:00Z';
      meterValues({
        params: { connectorId: 1, meterValue: [reading(timestamp, '100')] },
      });
      const replacement = reading(timestamp, '101');
      meterValues({ params: { connectorId: 1, meterValue: [replacement] } });
      expect(state.get('CP_METER')!.connectors.get(1)!.meterValue).toEqual(
        replacement,
      );
    });

    it('does not mutate readings from replaced or closed clients', () => {
      const old = connect();
      const current = connect();
      const update = jest.spyOn(state, 'updateMeterValues');
      const params = {
        connectorId: 1,
        meterValue: [reading('2026-11-02T10:00:00Z', '100')],
      };

      expect(() => old.meterValues({ params })).toThrow(
        'Connection is no longer current',
      );
      current.client.emit('close');
      expect(() => current.meterValues({ params })).toThrow(
        'Connection is no longer current',
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('StopTransaction', () => {
    let complete: jest.Mock;
    let server: EventEmitter;
    let service: OcppRpcServerService;
    const params = {
      transactionId: 42,
      meterStop: 1500,
      timestamp: '2026-11-02T11:00:00Z',
      idTag: 'DIFFERENT_STOP_TAG',
      reason: 'Remote',
    };

    function connect(identity = 'CP_STOP') {
      const client = Object.assign(new EventEmitter(), {
        identity,
        session: { sessionId: 'test' },
        handle: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      });
      server.emit('client', client);
      const registration = client.handle.mock.calls.find(
        ([method]) => method === 'StopTransaction',
      );
      expect(registration).toBeDefined();
      return { client, stopTransaction: registration![1] };
    }

    beforeEach(async () => {
      const transport = Object.assign(new EventEmitter(), {
        auth: jest.fn(),
        listen: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      });
      server = transport;
      jest
        .mocked(RPCServer)
        .mockImplementation(() => transport as unknown as RPCServer);
      complete = jest.fn();
      service = new OcppRpcServerService(
        {} as ChargerService,
        {} as UserService,
        new RpcConnectionManagerService(),
        new ChargeStateService(),
        { complete } as unknown as SessionService,
      );
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('completes using the sending charger identity without changing session ownership', async () => {
      complete.mockResolvedValue(true);
      const { stopTransaction } = connect();

      await expect(stopTransaction({ params })).resolves.toEqual({});
      expect(complete).toHaveBeenCalledTimes(1);
      expect(complete).toHaveBeenCalledWith({
        transactionId: 42,
        chargePointId: 'CP_STOP',
        endedAt: new Date(params.timestamp),
        meterStop: 1500,
      });
    });

    it('acknowledges repeated stops even when no active session matches', async () => {
      complete.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const { stopTransaction } = connect();
      await expect(stopTransaction({ params })).resolves.toEqual({});
      await expect(stopTransaction({ params })).resolves.toEqual({});
      expect(complete).toHaveBeenCalledTimes(2);
    });

    it('acknowledges an unknown or foreign transaction using the current no-match policy', async () => {
      complete.mockResolvedValue(false);
      const { stopTransaction } = connect('CP_OTHER');
      await expect(stopTransaction({ params })).resolves.toEqual({});
      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 42,
          chargePointId: 'CP_OTHER',
        }),
      );
    });

    it('waits for completion persistence before acknowledging', async () => {
      let finish!: (completed: boolean) => void;
      complete.mockReturnValue(
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
      );
      const { stopTransaction } = connect();
      let settled = false;
      const response = stopTransaction({ params }).then((result) => {
        settled = true;
        return result;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      finish(true);
      await expect(response).resolves.toEqual({});
    });

    it('propagates database failure without acknowledging success', async () => {
      const error = new Error('Database unavailable');
      complete.mockRejectedValue(error);
      const { stopTransaction } = connect();
      await expect(stopTransaction({ params })).rejects.toBe(error);
    });

    it('does not complete sessions from replaced or closed clients', async () => {
      const old = connect();
      const current = connect();
      await expect(old.stopTransaction({ params })).rejects.toThrow(
        'Connection is no longer current',
      );
      current.client.emit('close');
      await expect(current.stopTransaction({ params })).rejects.toThrow(
        'Connection is no longer current',
      );
      expect(complete).not.toHaveBeenCalled();
    });
  });

  describe('StartTransaction', () => {
    let start: jest.Mock;
    let server: EventEmitter;
    let service: OcppRpcServerService;
    const params = {
      connectorId: 2,
      idTag: 'TEST',
      meterStart: 1234,
      timestamp: '2026-11-02T10:00:00Z',
    };

    function connect() {
      const client = Object.assign(new EventEmitter(), {
        identity: 'CP_START',
        session: { sessionId: 'test' },
        handle: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      });
      server.emit('client', client);
      const registration = client.handle.mock.calls.find(
        ([method]) => method === 'StartTransaction',
      );
      expect(registration).toBeDefined();
      return { client, startTransaction: registration![1] };
    }

    beforeEach(async () => {
      const transport = Object.assign(new EventEmitter(), {
        auth: jest.fn(),
        listen: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      });
      server = transport;
      jest
        .mocked(RPCServer)
        .mockImplementation(() => transport as unknown as RPCServer);
      start = jest.fn();
      service = new OcppRpcServerService(
        {} as ChargerService,
        {} as UserService,
        new RpcConnectionManagerService(),
        new ChargeStateService(),
        { start } as unknown as SessionService,
      );
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it.each(['Accepted', 'Invalid'] as const)(
      'returns the persisted transaction ID and %s authorization outcome',
      async (authorizationStatus) => {
        start.mockResolvedValue({ transactionId: 42, authorizationStatus });
        const { startTransaction } = connect();

        await expect(startTransaction({ params })).resolves.toEqual({
          transactionId: 42,
          idTagInfo: { status: authorizationStatus },
        });
        expect(start).toHaveBeenCalledTimes(1);
        expect(start).toHaveBeenCalledWith({
          chargePointId: 'CP_START',
          connectorId: 2,
          idTag: 'TEST',
          meterStart: 1234,
          startedAt: new Date(params.timestamp),
        });
      },
    );

    it('waits for persistence before returning a transaction ID', async () => {
      let finish!: (value: {
        transactionId: number;
        authorizationStatus: string;
      }) => void;
      start.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const { startTransaction } = connect();
      let settled = false;
      const response = startTransaction({ params }).then((result) => {
        settled = true;
        return result;
      });

      await Promise.resolve();
      expect(settled).toBe(false);
      finish({ transactionId: 42, authorizationStatus: 'Accepted' });
      await expect(response).resolves.toEqual({
        transactionId: 42,
        idTagInfo: { status: 'Accepted' },
      });
    });

    it('translates an active-session conflict into the existing GenericError policy', async () => {
      start.mockRejectedValue(new ActiveSessionConflictError());
      const { startTransaction } = connect();

      await expect(startTransaction({ params })).rejects.toMatchObject({
        rpcErrorCode: 'GenericError',
        message: 'Connector already has an active session',
      });
    });

    it('propagates other database errors without a successful response', async () => {
      const error = new Error('Database unavailable');
      start.mockRejectedValue(error);
      const { startTransaction } = connect();
      await expect(startTransaction({ params })).rejects.toBe(error);
    });

    it('does not create sessions for replaced or closed clients', async () => {
      const old = connect();
      const current = connect();
      await expect(old.startTransaction({ params })).rejects.toThrow(
        'Connection is no longer current',
      );
      current.client.emit('close');
      await expect(current.startTransaction({ params })).rejects.toThrow(
        'Connection is no longer current',
      );
      expect(start).not.toHaveBeenCalled();
    });
  });

  describe('StatusNotification', () => {
    let server: EventEmitter;
    let state: ChargeStateService;
    let service: OcppRpcServerService;

    function connect(identity = 'CP_STATUS') {
      const client = Object.assign(new EventEmitter(), {
        identity,
        session: { sessionId: 'test' },
        handle: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      });
      server.emit('client', client);
      const registration = client.handle.mock.calls.find(
        ([method]) => method === 'StatusNotification',
      );
      expect(registration).toBeDefined();
      return { client, notify: registration![1] };
    }

    beforeEach(async () => {
      const transport = Object.assign(new EventEmitter(), {
        auth: jest.fn(),
        listen: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      });
      server = transport;
      jest
        .mocked(RPCServer)
        .mockImplementation(() => transport as unknown as RPCServer);
      state = new ChargeStateService();
      service = new OcppRpcServerService(
        {} as ChargerService,
        {} as UserService,
        new RpcConnectionManagerService(),
        state,
        {} as SessionService,
      );
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('updates the sending charger connector and returns an empty acknowledgment', () => {
      const { notify } = connect();
      connect('CP_OTHER');
      const before = Date.now();

      expect(
        notify({
          params: {
            connectorId: 1,
            status: 'Charging',
            errorCode: 'NoError',
            timestamp: '2020-01-01T00:00:00Z',
          },
        }),
      ).toEqual({});

      const charger = state.get('CP_STATUS')!;
      expect(charger.connected).toBe(true);
      expect(charger.connectors.get(1)).toMatchObject({
        connectorId: 1,
        status: 'Charging',
        errorCode: 'NoError',
      });
      expect(
        charger.connectors.get(1)!.updatedAt.getTime(),
      ).toBeGreaterThanOrEqual(before);
      expect(
        charger.connectors.get(1)!.updatedAt.getTime(),
      ).toBeLessThanOrEqual(Date.now());
      expect(state.get('CP_OTHER')!.connectors.size).toBe(0);
    });

    it('preserves meter readings and other connector state on status updates', () => {
      const { notify } = connect();
      const reading = {
        timestamp: '2026-11-02T10:00:00Z',
        sampledValue: [{ value: '123' }],
      };
      state.updateMeterValues('CP_STATUS', {
        connectorId: 1,
        transactionId: 42,
        meterValue: [reading],
      });
      notify({
        params: { connectorId: 0, status: 'Available', errorCode: 'NoError' },
      });
      notify({
        params: { connectorId: 1, status: 'Charging', errorCode: 'NoError' },
      });
      notify({
        params: {
          connectorId: 1,
          status: 'Faulted',
          errorCode: 'GroundFailure',
        },
      });

      expect(state.get('CP_STATUS')!.connectors.get(1)).toMatchObject({
        status: 'Faulted',
        errorCode: 'GroundFailure',
        meterValue: reading,
        transactionId: 42,
      });
      expect(state.get('CP_STATUS')!.connectors.get(0)!.status).toBe(
        'Available',
      );
    });

    it('rejects stale-client updates and preserves connected state when the old client closes', () => {
      const old = connect();
      const current = connect();
      current.notify({
        params: { connectorId: 1, status: 'Charging', errorCode: 'NoError' },
      });

      expect(() =>
        old.notify({
          params: {
            connectorId: 1,
            status: 'Available',
            errorCode: 'NoError',
          },
        }),
      ).toThrow('Connection is no longer current');
      old.client.emit('close');

      expect(state.get('CP_STATUS')!.connected).toBe(true);
      expect(state.get('CP_STATUS')!.connectors.get(1)!.status).toBe(
        'Charging',
      );
      current.client.emit('close');
      expect(state.get('CP_STATUS')!.connected).toBe(false);
      expect(() =>
        current.notify({
          params: {
            connectorId: 1,
            status: 'Available',
            errorCode: 'NoError',
          },
        }),
      ).toThrow('Connection is no longer current');
    });
  });

  it('keeps the replacement registered when an old RPC client closes', async () => {
    const server = Object.assign(new EventEmitter(), {
      auth: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    });
    jest
      .mocked(RPCServer)
      .mockImplementation(() => server as unknown as RPCServer);
    const connections = new RpcConnectionManagerService();
    const service = new OcppRpcServerService(
      {} as ChargerService,
      {} as UserService,
      connections,
      new ChargeStateService(),
      {} as SessionService,
    );
    const makeClient = (identity: string) =>
      Object.assign(new EventEmitter(), {
        identity,
        session: { sessionId: 'test' },
        handle: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      });
    const old = makeClient('CP_TEST');
    const current = makeClient('CP_TEST');
    const other = makeClient('CP_OTHER');
    await service.onModuleInit();

    server.emit('client', old);
    server.emit('client', other);
    expect(connections.get('CP_TEST')).toBe(old);
    server.emit('client', current);
    expect(old.close).toHaveBeenCalledTimes(1);
    old.emit('close');
    expect(connections.get('CP_TEST')).toBe(current);
    current.emit('close');
    expect(connections.get('CP_TEST')).toBeUndefined();
    expect(connections.get('CP_OTHER')).toBe(other);
    await service.onModuleDestroy();
  });

  describe('BootNotification', () => {
    let registerOrUpdate: jest.Mock;
    let handle: jest.Mock;

    const params = {
      chargePointVendor: 'TestVendor',
      chargePointModel: 'TestModel',
    };

    beforeEach(async () => {
      registerOrUpdate = jest.fn();
      handle = jest.fn();

      const server = Object.assign(new EventEmitter(), {
        auth: jest.fn(),
        listen: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      });

      jest
        .mocked(RPCServer)
        .mockImplementation(() => server as unknown as RPCServer);

      const service = new OcppRpcServerService(
        {
          registerOrUpdate,
        } as unknown as ChargerService,
        {} as UserService,
        new RpcConnectionManagerService(),
        new ChargeStateService(),
        {} as SessionService,
      );

      await service.onModuleInit();

      server.emit('client', {
        identity: 'CP_TEST',
        session: { sessionId: 'test' },
        handle,
        on: jest.fn(),
      });
    });

    it('rejects when persistence fails', async () => {
      const error = new Error('Database unavailable');
      registerOrUpdate.mockRejectedValue(error);

      const registration = handle.mock.calls.find(
        ([method]) => method === 'BootNotification',
      );
      expect(registration).toBeDefined();
      const bootHandler = registration![1];

      await expect(bootHandler({ params })).rejects.toBe(error);

      expect(registerOrUpdate).toHaveBeenCalledWith('CP_TEST', params);
    });

    it('does not return before persistence has finished', async () => {
      let finishPersistence!: () => void;
      registerOrUpdate.mockReturnValue(
        new Promise<void>((resolve) => {
          finishPersistence = resolve;
        }),
      );

      const registration = handle.mock.calls.find(
        ([method]) => method === 'BootNotification',
      );

      expect(registration).toBeDefined();
      const bootHandler = registration![1];

      const unresolvedHandle = bootHandler({ params });
      expect(registerOrUpdate).toHaveBeenCalledWith('CP_TEST', params);

      let settled = false;
      const response = unresolvedHandle.then((result) => {
        settled = true;
        return result;
      });

      await Promise.resolve();

      expect(settled).toBe(false);

      finishPersistence();

      await expect(response).resolves.toMatchObject({
        status: 'Accepted',
      });
      expect(settled).toBe(true);
    });
  });
  describe('Heartbeat', () => {
    let handle: jest.Mock;
    const params = {};

    beforeEach(async () => {
      handle = jest.fn();

      const server = Object.assign(new EventEmitter(), {
        auth: jest.fn(),
        listen: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      });

      jest
        .mocked(RPCServer)
        .mockImplementation(() => server as unknown as RPCServer);

      const service = new OcppRpcServerService(
        {} as unknown as ChargerService,
        {} as unknown as UserService,
        new RpcConnectionManagerService(),
        new ChargeStateService(),
        {} as SessionService,
      );

      await service.onModuleInit();

      server.emit('client', {
        identity: 'CP_TEST',
        session: { sessionId: 'test' },
        handle,
        on: jest.fn(),
      });
    });

    it('returns the date in ISO string format', () => {
      const registration = handle.mock.calls.find(
        ([method]) => method === 'Heartbeat',
      );
      expect(registration).toBeDefined();
      const heartbeatHandler = registration![1];

      expect(heartbeatHandler({ params })).toMatchObject({
        currentTime: expect.any(String),
      });
    });
  });

  describe('Authorize', () => {
    let findByIdTag: jest.Mock;
    let handle: jest.Mock;

    const params = {
      idTag: 'TEST',
    };

    beforeEach(async () => {
      findByIdTag = jest.fn();
      handle = jest.fn();

      const server = Object.assign(new EventEmitter(), {
        auth: jest.fn(),
        listen: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      });

      jest
        .mocked(RPCServer)
        .mockImplementation(() => server as unknown as RPCServer);

      const service = new OcppRpcServerService(
        {} as ChargerService,
        { findByIdTag } as unknown as UserService,
        new RpcConnectionManagerService(),
        new ChargeStateService(),
        {} as SessionService,
      );

      await service.onModuleInit();

      server.emit('client', {
        identity: 'CP_TEST',
        session: { sessionId: 'test' },
        handle,
        on: jest.fn(),
      });
    });

    it('returns "Accepted" on a valid idTag', async () => {
      findByIdTag.mockResolvedValue({
        userId: 'user-1',
      });
      const registration = handle.mock.calls.find(
        ([method]) => method === 'Authorize',
      );
      expect(registration).toBeDefined();
      const authorizeHandler = registration![1];

      await expect(authorizeHandler({ params })).resolves.toMatchObject({
        idTagInfo: {
          status: 'Accepted',
        },
      });

      expect(findByIdTag).toHaveBeenCalledWith('TEST');
    });
    it('returns "Invalid" on a invalid idTag', async () => {
      findByIdTag.mockResolvedValue(null);
      const registration = handle.mock.calls.find(
        ([method]) => method === 'Authorize',
      );
      expect(registration).toBeDefined();
      const authorizeHandler = registration![1];

      await expect(authorizeHandler({ params })).resolves.toMatchObject({
        idTagInfo: {
          status: 'Invalid',
        },
      });

      expect(findByIdTag).toHaveBeenCalledWith('TEST');
    });

    it('propagates database Errors', async () => {
      const error = new Error('Database failure');
      findByIdTag.mockRejectedValue(error);
      const registration = handle.mock.calls.find(
        ([method]) => method === 'Authorize',
      );
      expect(registration).toBeDefined();
      const authorizeHandler = registration![1];

      await expect(authorizeHandler({ params })).rejects.toBe(error);

      expect(findByIdTag).toHaveBeenCalledWith('TEST');
    });
  });
});
