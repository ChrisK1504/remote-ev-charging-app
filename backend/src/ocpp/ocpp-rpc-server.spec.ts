import { RPCServer } from 'ocpp-rpc';
import { ChargerService } from './charger.service';
import { OcppRpcServerService } from './ocpp-rpc-server.service';
import { EventEmitter } from 'stream';
import { UserService } from '../users/user.service';
import { RpcConnectionManagerService } from './rpc-connection-manager.service';
import { ChargeStateService } from './charger-state.service';

jest.mock('ocpp-rpc', () => ({
  ...jest.requireActual('ocpp-rpc'),
  RPCServer: jest.fn(),
}));

describe('Ocpp-RPC Server Service', () => {
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
