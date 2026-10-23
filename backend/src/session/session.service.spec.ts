import { ActiveSessionConflictError, SessionService } from './session.service';
import { QueryFailedError, Repository } from 'typeorm';
import { ChargingSession } from './charging-session.entity';
import { UserService } from '../users/user.service';

function chargingUsers() {
  return {
    findByIdTag: jest.fn().mockResolvedValue({ userId: 'user-1' }),
  } as unknown as UserService;
}

describe('SessionService.complete', () => {
  it('includes charger ownership in the update conditions', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 0 });

    const repository = {
      update,
    } as unknown as Repository<ChargingSession>;

    const service = new SessionService(repository, chargingUsers());
    const endedAt = new Date('2026-10-14T10:05:00Z');

    const completed = await service.complete({
      transactionId: 42,
      chargePointId: 'CP_B',
      endedAt,
      meterStop: 200,
    });

    expect(update).toHaveBeenCalledWith(
      {
        transactionId: 42,
        chargePointId: 'CP_B',
        status: 'Active',
      },
      {
        status: 'Completed',
        endedAt,
        meterStop: 200,
      },
    );

    expect(completed).toBe(false);
  });

  it('returns true when one active session is completed', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 });

    const repository = {
      update,
    } as unknown as Repository<ChargingSession>;

    const service = new SessionService(repository, chargingUsers());
    const endedAt = new Date('2026-10-14T10:05:00Z');

    const completed = await service.complete({
      transactionId: 42,
      chargePointId: 'CP_B',
      endedAt,
      meterStop: 200,
    });

    expect(update).toHaveBeenCalledWith(
      {
        transactionId: 42,
        chargePointId: 'CP_B',
        status: 'Active',
      },
      {
        status: 'Completed',
        endedAt,
        meterStop: 200,
      },
    );

    expect(completed).toBe(true);
  });
});

describe('SessionService.start', () => {
  it('translates the active-session uniqueness violation into ActiveSessionConflictError', async () => {
    const driverError = Object.assign(new Error('duplicate active session'), {
      code: '23505',
      constraint: 'idx_active_session_per_connector',
    });
    const dbError = new QueryFailedError('INSERT', undefined, driverError);
    const create = jest.fn().mockImplementation((input) => input);
    const save = jest.fn().mockRejectedValue(dbError);
    const repository = {
      save,
      create,
    } as unknown as Repository<ChargingSession>;

    const service = new SessionService(repository, chargingUsers());

    await expect(
      service.start({
        chargePointId: 'CP-a',
        connectorId: 1,
        idTag: 'TEST',
        meterStart: 200,
        startedAt: new Date('2026-10-14T10:05:00Z'),
      }),
    ).rejects.toBeInstanceOf(ActiveSessionConflictError);

    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('SessionService.start unrelated failures', () => {
  it.each([
    new QueryFailedError(
      'INSERT',
      undefined,
      Object.assign(new Error('other unique constraint'), {
        code: '23505',
        constraint: 'other_constraint',
      }),
    ),
    new QueryFailedError(
      'INSERT',
      undefined,
      Object.assign(new Error('database unavailable'), {
        code: '08006',
      }),
    ),
    new Error('unexpected failure'),
  ])('preserves the original error: %s', async (error) => {
    const repository = {
      create: jest.fn().mockImplementation((input) => input),
      save: jest.fn().mockRejectedValue(error),
    } as unknown as Repository<ChargingSession>;
    const service = new SessionService(repository, chargingUsers());
    await expect(
      service.start({
        chargePointId: 'CP-A',
        connectorId: 1,
        idTag: 'TEST',
        meterStart: 0,
        startedAt: new Date('2026-10-14T10:05:00Z'),
      }),
    ).rejects.toBe(error);
  });
});
