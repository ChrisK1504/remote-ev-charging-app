import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { UserService } from '../users/user.service';
import { AuthService } from './auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { User } from '../users/user.entity';
import request from 'supertest';
import session from 'express-session';
import type { Request } from 'express';

describe('POST /auth/login', () => {
  let app: INestApplication;
  let passwordHash: string;

  const repository = {
    findOne: jest.fn(),
  };

  beforeAll(async () => {
    passwordHash = await argon2.hash('testTest123!');

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: repository,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    // MemoryStore is confined to this test application, never production.
    app.use(
      session({
        secret: 'login-http-test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, secure: false },
      }),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });
  beforeEach(() => {
    repository.findOne.mockReset();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it.each([
    ['null email and numeric password', { email: null, password: 123 }],
    ['missing email', { password: 'testTest123!' }],
    ['missing password', { email: 'driver@example.com' }],
    ['invalid email', { email: 'invalid', password: 'testTest123!' }],
    ['empty password', { email: 'driver@example.com', password: '' }],
    [
      'unexpected properties',
      { email: 'driver@example.com', password: 'testTest123!', role: 'admin' },
    ],
  ])('rejects %s before querying users', async (_description, body) => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send(body)
      .expect(400);

    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('returns a safe user when credentials are correct', async () => {
    repository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'driver@example.com',
      passwordHash,
    });

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'driver@example.com',
        password: 'testTest123!',
      })
      .expect(200);

    expect(response.body).toEqual({
      id: 'user-1',
      email: 'driver@example.com',
    });
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining('connect.sid='),
    ]);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  });

  it('returns the same unauthorized response for wrong passwords and unknown emails', async () => {
    repository.findOne.mockResolvedValueOnce({
      id: 'user-1',
      email: 'driver@example.com',
      passwordHash,
    });

    const wrongPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'driver@example.com', password: 'wrong-password' })
      .expect(401);

    repository.findOne.mockResolvedValueOnce(null);

    const unknownEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'unknown@example.com', password: 'testTest123!' })
      .expect(401);

    expect(wrongPassword.body).toEqual({
      statusCode: 401,
      message: 'Invalid email or password',
      error: 'Unauthorized',
    });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(repository.findOne).toHaveBeenCalledTimes(2);
  });
});

describe('Login session sequencing', () => {
  const credentials = { email: 'driver@example.com', password: 'testTest123!' };
  const user = { id: 'user-1', email: credentials.email };

  function setup() {
    const login = jest.fn().mockResolvedValue(user);
    const controller = new AuthController({ login } as unknown as AuthService);
    let finishRegeneration!: (error?: Error) => void;
    let finishSave!: (error?: Error) => void;
    const regeneratedSession = {
      userId: undefined as string | undefined,
      save: jest.fn((callback: (error?: Error) => void) => {
        finishSave = callback;
      }),
    };
    const regenerate = jest.fn((callback: (error?: Error) => void) => {
      finishRegeneration = (error) => {
        if (!error) {
          // express-session replaces request.session during regeneration.
          req.session = regeneratedSession as unknown as Request['session'];
        }
        callback(error);
      };
    });
    const oldSession = { regenerate, userId: undefined as string | undefined };
    const req = { session: oldSession } as unknown as Request;
    return {
      login,
      controller,
      req,
      oldSession,
      regeneratedSession,
      regenerate,
      finishRegeneration: (error?: Error) => finishRegeneration(error),
      finishSave: (error?: Error) => finishSave(error),
    };
  }

  it('waits for regeneration and saving before returning the user', async () => {
    const test = setup();
    const resolved = jest.fn();
    const pending = test.controller
      .login(credentials, test.req)
      .then((result) => {
        resolved(result);
        return result;
      });
    await Promise.resolve();
    expect(test.regenerate).toHaveBeenCalledTimes(1);
    expect(test.oldSession.userId).toBeUndefined();
    expect(test.regeneratedSession.save).not.toHaveBeenCalled();
    expect(resolved).not.toHaveBeenCalled();

    test.finishRegeneration();
    await Promise.resolve();
    expect(test.regeneratedSession.userId).toBe(user.id);
    expect(test.regeneratedSession.save).toHaveBeenCalledTimes(1);
    expect(resolved).not.toHaveBeenCalled();

    test.finishSave();
    await expect(pending).resolves.toEqual(user);
  });

  it('does not assign identity or save when regeneration fails', async () => {
    const test = setup();
    const error = new Error('Session regeneration failed');
    const pending = test.controller.login(credentials, test.req);
    const assertion = expect(pending).rejects.toBe(error);
    await Promise.resolve();
    test.finishRegeneration(error);
    await assertion;
    expect(test.oldSession.userId).toBeUndefined();
    expect(test.regeneratedSession.save).not.toHaveBeenCalled();
  });

  it('rejects login when saving fails', async () => {
    const test = setup();
    const error = new Error('Session store unavailable');
    const pending = test.controller.login(credentials, test.req);
    const assertion = expect(pending).rejects.toBe(error);
    await Promise.resolve();
    test.finishRegeneration();
    await Promise.resolve();
    test.finishSave(error);
    await assertion;
  });

  it('does not regenerate or save when credentials are rejected', async () => {
    const test = setup();
    const error = new Error('Invalid credentials');
    test.login.mockRejectedValue(error);
    await expect(test.controller.login(credentials, test.req)).rejects.toBe(
      error,
    );
    expect(test.regenerate).not.toHaveBeenCalled();
    expect(test.regeneratedSession.save).not.toHaveBeenCalled();
  });
});
