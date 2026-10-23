import { Repository } from 'typeorm/repository/Repository.js';
import { User } from './user.entity';
import { UserService } from './user.service';
import * as argon2 from 'argon2';

describe('UserService.create', () => {
  it('normalizes email and saves a usable password hash', async () => {
    const password = 'testTest123';
    const email = 'TEST@email.com ';

    const create = jest.fn().mockImplementation((input) => input);
    const save = jest.fn().mockImplementation(async (user) => user);

    const repository = {
      create,
      save,
    } as unknown as Repository<User>;

    const service = new UserService(repository);

    const result = await service.create({ email, password });

    expect(create).toHaveBeenCalledWith({
      id: expect.any(String),
      email: 'test@email.com',
      passwordHash: expect.any(String),
      idTag: expect.stringMatching(/^[0-9a-f]{20}$/),
    });

    expect(save).toHaveBeenCalledTimes(1);

    const storedUser = save.mock.calls[0][0] as User;

    expect(await argon2.verify(storedUser.passwordHash, password)).toBe(true);
    expect(await argon2.verify(storedUser.passwordHash, 'wrong-password')).toBe(
      false,
    );

    expect(result).toEqual({
      id: storedUser.id,
      email: 'test@email.com',
    });
  });

  it('rejects when saving fails', async () => {
    const error = new Error('Database unavailable');

    const repository = {
      create: jest.fn().mockImplementation((input) => input),
      save: jest.fn().mockRejectedValue(error),
    } as unknown as Repository<User>;

    const service = new UserService(repository);

    await expect(
      service.create({
        email: 'driver@example.com',
        password: 'TestTest123',
      }),
    ).rejects.toBe(error);
  });

  it('waits for persistence before resolving', async () => {
    let resolveSave!: (user: User) => void;

    const persistence = new Promise<User>((resolve) => {
      resolveSave = resolve;
    });

    let markSaveStarted!: () => void;
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });

    const create = jest.fn().mockImplementation((input) => input);

    const save = jest.fn().mockImplementation(() => {
      markSaveStarted();
      return persistence;
    });

    const repository = {
      create,
      save,
    } as unknown as Repository<User>;

    const service = new UserService(repository);
    const resolved = jest.fn();

    const creation = service
      .create({
        email: 'driver@example.com',
        password: 'Test123',
      })
      .then((user) => {
        resolved(user);
        return user;
      });

    await saveStarted;
    await Promise.resolve();

    expect(resolved).not.toHaveBeenCalled();

    const storedUser = save.mock.calls[0][0] as User;
    resolveSave(storedUser);

    await expect(creation).resolves.toEqual({
      id: storedUser.id,
      email: storedUser.email,
    });
  });
});

describe('UserService.verifyCredentials', () => {
  it('finds the user with an existing email and correct password', async () => {
    const password = 'testTest123';
    const passwordHash = await argon2.hash(password);

    const findOne = jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'driver@example.com',
      passwordHash,
    });

    const repository = { findOne } as unknown as Repository<User>;
    const service = new UserService(repository);

    const result = await service.verifyCredentials({
      email: '  DRIVER@example.com ',
      password,
    });

    expect(findOne).toHaveBeenCalledWith({
      where: { email: 'driver@example.com' },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    expect(result).toEqual({
      id: 'user-1',
      email: 'driver@example.com',
    });
  });

  it('returns null when wrong password', async () => {
    const password = 'testTest123';
    const passwordHash = await argon2.hash(password);

    const findOne = jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'driver@example.com',
      passwordHash,
    });

    const repository = { findOne } as unknown as Repository<User>;
    const service = new UserService(repository);

    const result = await service.verifyCredentials({
      email: '  DRIVER@example.com ',
      password: 'wrong-password',
    });

    expect(result).toEqual(null);
  });

  it('returns null when unknown email', async () => {
    const findOne = jest.fn().mockResolvedValue(null);

    const repository = { findOne } as unknown as Repository<User>;
    const service = new UserService(repository);

    const result = await service.verifyCredentials({
      email: '  DRIVER@example.com ',
      password: 'wrong-password',
    });

    expect(result).toEqual(null);
  });

  it('propagates database error', async () => {
    const error = new Error('Database unavailable');
    const findOne = jest.fn().mockRejectedValue(error);

    const repository = { findOne } as unknown as Repository<User>;
    const service = new UserService(repository);

    await expect(
      service.verifyCredentials({
        email: 'driver@example.com',
        password: 'testTest123',
      }),
    ).rejects.toBe(error);
  });
});
