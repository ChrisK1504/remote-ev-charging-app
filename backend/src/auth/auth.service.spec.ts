import { UnauthorizedException } from '@nestjs/common';
import { UserService } from '../users/user.service';
import { AuthService } from './auth.service';

describe('AuthService.login', () => {
  it('returns the user when credentials are correct', async () => {
    const user = {
      id: 'user-1',
      email: 'driver@example.com',
    };

    const verifyCredentials = jest.fn().mockResolvedValue(user);

    const userService = {
      verifyCredentials,
    } as unknown as UserService;

    const authService = new AuthService(userService);

    const input = {
      email: 'driver@example.com',
      password: 'testTest123',
    };

    const result = await authService.login(input);

    expect(verifyCredentials).toHaveBeenCalledWith(input);
    expect(result).toEqual(user);
  });

  it('throws UnauthorizedException when credentials are incorrect', async () => {
    const verifyCredentials = jest.fn().mockResolvedValue(null);

    const userService = {
      verifyCredentials,
    } as unknown as UserService;

    const authService = new AuthService(userService);

    await expect(
      authService.login({
        email: 'driver@example.com',
        password: 'testTest123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('propagates database error', async () => {
    const databaseError = new Error('Database unavailable');
    const verifyCredentials = jest.fn().mockRejectedValue(databaseError);

    const userService = {
      verifyCredentials,
    } as unknown as UserService;

    const authService = new AuthService(userService);

    await expect(
      authService.login({
        email: 'driver@example.com',
        password: 'testTest123',
      }),
    ).rejects.toBe(databaseError);
  });
});

describe('AuthService.getCurrentUser()', () => {
  it('rejects with UnauthorizedException when userId is undefined', async () => {
    const findById = jest.fn();
    const userService = { findById } as unknown as UserService;

    const authService = new AuthService(userService);

    const userId = undefined;

    await expect(authService.getCurrentUser(userId)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findById).not.toHaveBeenCalled();
  });

  it('returns sucessfully when user exists', async () => {
    const id = 'user-1';
    const findById = jest.fn().mockResolvedValue({
      id,
      email: 'driver@example.com',
    });
    const userService = { findById } as unknown as UserService;
    const authService = new AuthService(userService);

    const result = await authService.getCurrentUser(id);

    expect(result).toEqual({
      id,
      email: 'driver@example.com',
    });
    expect(findById).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith({
      id,
    });
  });

  it('rejects with UnauthorizedException when user does not exist', async () => {
    const id = 'user-1';
    const findById = jest.fn().mockResolvedValue(null);
    const userService = { findById } as unknown as UserService;
    const authService = new AuthService(userService);

    await expect(authService.getCurrentUser(id)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findById).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith({
      id,
    });
  });

  it('rejects when persistence fails', async () => {
    const databaseError = new Error('Database unavailable');
    const id = 'user-1';
    const findById = jest.fn().mockRejectedValue(databaseError);
    const userService = { findById } as unknown as UserService;
    const authService = new AuthService(userService);

    await expect(authService.getCurrentUser(id)).rejects.toBe(databaseError);
    expect(findById).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith({
      id,
    });
  });
});
