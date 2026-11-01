import { RPCServer } from 'ocpp-rpc';
import { ChargerService } from './charger.service';
import { OcppRpcServerService } from './ocpp-rpc-server.service';
import { EventEmitter } from 'stream';
import { identity } from 'rxjs';

jest.mock('ocpp-rpc', () => ({
  ...jest.requireActual('ocpp-rpc'),
  RPCServer: jest.fn(),
}));

describe('Ocpp-RPC Server Service', () => {
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

      const service = new OcppRpcServerService({
        registerOrUpdate,
      } as unknown as ChargerService);

      await service.onModuleInit();

      server.emit('client', {
        identity: 'CP_TEST',
        session: { sessionId: 'test' },
        handle,
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
});
