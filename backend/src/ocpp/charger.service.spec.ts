import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { Charger } from './charger.entity';
import { ChargerService } from './charger.service';

describe('ChargerService credentials', () => {
  const password = Buffer.from('disposable-test-password');
  let passwordHash: string;
  const findOne = jest.fn();
  const create = jest.fn();
  const save = jest.fn();
  let service: ChargerService;

  beforeAll(async () => {
    passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChargerService({
      findOne,
      create,
      save,
    } as unknown as Repository<Charger>);
  });

  it('rejects unknown identities and explicitly selects the credential hash', async () => {
    findOne.mockResolvedValue(null);
    await expect(
      service.verifyCredentials({ connectionId: 'UNKNOWN', password }),
    ).resolves.toBe(false);
    expect(findOne).toHaveBeenCalledWith({
      where: { connectionId: 'UNKNOWN' },
      select: { passwordHash: true },
    });
  });

  it.each([true, false])(
    'returns %s for matching or incorrect credentials',
    async (valid) => {
      findOne.mockResolvedValue({ passwordHash });
      await expect(
        service.verifyCredentials({
          connectionId: 'CP_TEST',
          password: valid ? password : Buffer.from('wrong'),
        }),
      ).resolves.toBe(valid);
    },
  );

  it('propagates database failure rather than reporting an incorrect password', async () => {
    const error = new Error('database unavailable');
    findOne.mockRejectedValue(error);
    await expect(
      service.verifyCredentials({ connectionId: 'CP_TEST', password }),
    ).rejects.toBe(error);
  });

  it('propagates invalid stored hashes', async () => {
    findOne.mockResolvedValue({ passwordHash: 'invalid-hash' });
    await expect(
      service.verifyCredentials({ connectionId: 'CP_TEST', password }),
    ).rejects.toThrow();
  });

  it('provisions an Argon2id hash and returns only public identifiers', async () => {
    create.mockImplementation((value) => value);
    save.mockImplementation(async (value) => value);
    const result = await service.provision({
      connectionId: 'CP_TEST',
      password: password.toString(),
    });
    const stored = save.mock.calls[0][0] as Charger;
    expect(stored.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(stored.passwordHash, password)).toBe(true);
    expect(result).toEqual({ id: stored.id, connectionId: 'CP_TEST' });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('propagates duplicate identity errors without retrying or replacing credentials', async () => {
    const error = Object.assign(new Error('duplicate identity'), {
      code: '23505',
    });
    create.mockImplementation((value) => value);
    save.mockRejectedValue(error);
    await expect(
      service.provision({ connectionId: 'CP_TEST', password: 'test' }),
    ).rejects.toBe(error);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
