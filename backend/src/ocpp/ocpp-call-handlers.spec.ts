import { SessionService } from '../session/session.service';
import { UserService } from '../users/user.service';
import { OcppCallHandlersService } from './ocpp-call-handlers.service';
import { ChargeStateService } from './charger-state.service';

describe('OcppCallHandler Authorize', () => {
  let service: OcppCallHandlersService;
  let findByIdTag: jest.Mock;

  beforeEach(() => {
    findByIdTag = jest.fn();

    const users = { findByIdTag } as unknown as UserService;
    const sessions = {} as SessionService;

    service = new OcppCallHandlersService(
      new ChargeStateService(),
      sessions,
      users,
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
