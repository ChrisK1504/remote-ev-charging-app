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
