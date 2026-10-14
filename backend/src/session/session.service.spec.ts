import { SessionService } from './session.service';
import { Repository } from 'typeorm';
import { ChargingSession } from './charging-session.entity';

describe('SessionService.complete', () => {
  it('includes charger ownership in the update conditions', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 0 });

    const repository = {
      update,
    } as unknown as Repository<ChargingSession>;

    const service = new SessionService(repository);
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

    const service = new SessionService(repository);
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
