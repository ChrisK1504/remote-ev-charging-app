import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { UserService } from '../users/user.service';
import { AuthService } from './auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { User } from '../users/user.entity';
import request from 'supertest';

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
