import { SessionService } from '../session/session.service';
import { UserService } from '../users/user.service';
import { OcppCallHandlersService } from './ocpp-call-handlers.service';
import { ChargeStateService } from './charger-state.service';
import { ChargerService } from './charger.service';

describe('OcppCallHandler Authorize', () => {
  let service: OcppCallHandlersService;
  let findByIdTag: jest.Mock;

  beforeEach(() => {
    findByIdTag = jest.fn();

    const users = { findByIdTag } as unknown as UserService;
    const sessions = {} as SessionService;
    const chargers = {} as ChargerService;

    service = new OcppCallHandlersService(
      new ChargeStateService(),
      sessions,
      users,
      chargers,
    );
  });

  it('accepts an IdTag belonging to an existing user', async () => {
    findByIdTag.mockResolvedValue({ userId: 'user-1' });

    const response = await service.handle('CP_001', [
      2,
      'authorize-1',
      'Authorize',
      { idTag: 'abc123' },
    ]);

    expect(findByIdTag).toHaveBeenCalledWith('abc123');
    expect(response).toEqual({
      idTagInfo: { status: 'Accepted' },
    });
  });

  it('rejects an IdTag not belonging to an existing user', async () => {
    findByIdTag.mockResolvedValue(null);

    const response = await service.handle('CP_001', [
      2,
      'authorize-1',
      'Authorize',
      { idTag: 'abc123' },
    ]);

    expect(findByIdTag).toHaveBeenCalledWith('abc123');
    expect(response).toEqual({
      idTagInfo: { status: 'Invalid' },
    });
  });
  it('throws upon database error', async () => {
    const databaseError = new Error('Database failure');
    findByIdTag.mockRejectedValue(databaseError);

    await expect(
      service.handle('CP_001', [
        2,
        'authorize-1',
        'Authorize',
        { idTag: 'abc123' },
      ]),
    ).rejects.toBe(databaseError);
    expect(findByIdTag).toHaveBeenCalledWith('abc123');
  });
});

describe('OcppCallHandler BootNotification', () => {
  let service: OcppCallHandlersService;
  let registerOrUpdate: jest.Mock;
  const payload = {
    chargePointModel: 'EV',
    chargePointVendor: 'OCPP',
    chargePointSerialNumber: 'device-1',
    chargeBoxSerialNumber: 'box-1',
    firmwareVersion: '1.2.0',
    iccid: 'sim-1',
    imsi: 'subscriber-1',
    meterType: 'meter',
    meterSerialNumber: 'meter-1',
  };

  beforeEach(() => {
    registerOrUpdate = jest.fn().mockResolvedValue(undefined);
    service = new OcppCallHandlersService(
      new ChargeStateService(),
      {} as SessionService,
      {} as UserService,
      { registerOrUpdate } as unknown as ChargerService,
    );
  });

  function boot(messageId = 'boot-1') {
    return service.handle('CP_001', [
      2,
      messageId,
      'BootNotification',
      payload,
    ]);
  }

  it('passes the connection identity and all reported metadata to persistence', async () => {
    const result = await boot();
    expect(registerOrUpdate).toHaveBeenCalledTimes(1);
    expect(registerOrUpdate).toHaveBeenCalledWith('CP_001', payload);
    expect(result).toEqual({
      currentTime: expect.any(String),
      interval: 10,
      status: 'Accepted',
    });
  });

  it('accepts repeated boots through the same persistence operation', async () => {
    await expect(boot('boot-1')).resolves.toMatchObject({ status: 'Accepted' });
    await expect(boot('boot-2')).resolves.toMatchObject({ status: 'Accepted' });
    expect(registerOrUpdate).toHaveBeenCalledTimes(2);
    expect(registerOrUpdate).toHaveBeenNthCalledWith(1, 'CP_001', payload);
    expect(registerOrUpdate).toHaveBeenNthCalledWith(2, 'CP_001', payload);
  });

  it('does not return Accepted while persistence is still pending', async () => {
    let finishPersistence!: () => void;
    registerOrUpdate.mockReturnValue(
      new Promise<void>((resolve) => {
        finishPersistence = resolve;
      }),
    );
    const settled = jest.fn();
    const handling = Promise.resolve(boot()).then((result) => {
      settled();
      return result;
    });
    await Promise.resolve();
    expect(registerOrUpdate).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    finishPersistence();
    await expect(handling).resolves.toMatchObject({ status: 'Accepted' });
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('propagates persistence failure instead of returning Accepted', async () => {
    const databaseError = new Error('Database unavailable');
    registerOrUpdate.mockRejectedValue(databaseError);
    await expect(boot()).rejects.toBe(databaseError);
    expect(registerOrUpdate).toHaveBeenCalledTimes(1);
  });
});
