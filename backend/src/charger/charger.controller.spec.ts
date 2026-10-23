import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import session from 'express-session';
import request from 'supertest';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { ChargeStateService } from '../ocpp/charger-state.service';
import { OcppServerService } from '../ocpp/ocpp-server.service';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { ChargerController } from './charger.controller';

describe('Charger command authentication (HTTP)', () => {
  let app: INestApplication;
  let passwordHash: string;
  const credentials = { email: 'driver@example.com', password: 'testTest123!' };
  const repository = { findOne: jest.fn() };
  const state = { get: jest.fn() };
  const storedTag = '0123456789abcdef0123';
  const ocpp = {
    getActiveSession: jest.fn(),
    remoteStartTransaction: jest.fn(),
    remoteStopTransaction: jest.fn(),
  };

  beforeAll(async () => {
    passwordHash = await argon2.hash(credentials.password);
    const module = await Test.createTestingModule({
      controllers: [AuthController, ChargerController],
      providers: [
        AuthService,
        UserService,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: ChargeStateService, useValue: state },
        { provide: OcppServerService, useValue: ocpp },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    // This isolated MemoryStore exercises cookies without a production database.
    app.use(
      session({
        secret: 'charger-http-test-secret',
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
    jest.resetAllMocks();
    repository.findOne.mockResolvedValue({
      id: 'user-1',
      email: credentials.email,
      passwordHash,
      idTag: storedTag,
    });
    state.get.mockReturnValue({
      id: 'CP_001',
      connected: true,
      connectors: new Map(),
    });
    ocpp.getActiveSession.mockResolvedValue({
      transactionId: 42,
      userId: 'user-1',
    });
    ocpp.remoteStartTransaction.mockResolvedValue({ status: 'Accepted' });
    ocpp.remoteStopTransaction.mockResolvedValue({ status: 'Accepted' });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  function expectNoChargerAccess() {
    expect(state.get).not.toHaveBeenCalled();
    expect(ocpp.getActiveSession).not.toHaveBeenCalled();
    expect(ocpp.remoteStartTransaction).not.toHaveBeenCalled();
    expect(ocpp.remoteStopTransaction).not.toHaveBeenCalled();
  }

  async function login() {
    const client = request.agent(app.getHttpServer());
    await client.post('/auth/login').send(credentials).expect(200);
    repository.findOne.mockClear();
    return client;
  }

  describe.each([
    {
      name: 'start',
      path: '/chargers/CP_001/start',
      body: { connectorId: 1 },
    },
    { name: 'stop', path: '/chargers/CP_001/connector/1/stop', body: {} },
  ])('$name', ({ name, path, body }) => {
    it('rejects requests without a cookie before any user or charger lookup', async () => {
      await request(app.getHttpServer()).post(path).send(body).expect(401);
      expect(repository.findOne).not.toHaveBeenCalled();
      expectNoChargerAccess();
    });

    it('rejects a saved login cookie when its user has been deleted', async () => {
      const client = await login();
      repository.findOne.mockResolvedValue(null);
      await client.post(path).send(body).expect(401);
      expect(repository.findOne).toHaveBeenCalledTimes(1);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { id: true, email: true },
      });
      expectNoChargerAccess();
    });

    it('fails closed when the user lookup rejects', async () => {
      const client = await login();
      repository.findOne.mockRejectedValue(new Error('Database unavailable'));
      await client.post(path).send(body).expect(500);
      expect(repository.findOne).toHaveBeenCalledTimes(1);
      expectNoChargerAccess();
    });

    it('preserves command dispatch for a valid login cookie', async () => {
      const client = await login();
      const response = await client.post(path).send(body).expect(200);
      expect(response.body).toEqual({ status: 'Accepted' });
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { id: true, email: true },
      });
      if (name === 'start') {
        expect(ocpp.remoteStartTransaction).toHaveBeenCalledTimes(1);
        expect(ocpp.remoteStartTransaction).toHaveBeenCalledWith('CP_001', {
          connectorId: 1,
          idTag: storedTag,
        });
        expect(ocpp.getActiveSession).not.toHaveBeenCalled();
        expect(ocpp.remoteStopTransaction).not.toHaveBeenCalled();
      } else {
        expect(ocpp.getActiveSession).toHaveBeenCalledWith('CP_001', 1);
        expect(ocpp.remoteStopTransaction).toHaveBeenCalledTimes(1);
        expect(ocpp.remoteStopTransaction).toHaveBeenCalledWith('CP_001', {
          transactionId: 42,
        });
        expect(ocpp.remoteStartTransaction).not.toHaveBeenCalled();
      }
    });

    it('rejects commands after logout', async () => {
      const client = await login();
      await client.post('/auth/logout').expect(204);
      await client.post(path).send(body).expect(401);
      expect(repository.findOne).not.toHaveBeenCalled();
      expectNoChargerAccess();
    });
  });

  it('ignores a client-supplied tag and dispatches the stored user tag', async () => {
    const client = await login();

    await client
      .post('/chargers/CP_001/start')
      .send({ connectorId: 1, idTag: 'another-users-tag' })
      .expect(200);

    expect(ocpp.remoteStartTransaction).toHaveBeenCalledTimes(1);
    expect(ocpp.remoteStartTransaction).toHaveBeenCalledWith('CP_001', {
      connectorId: 1,
      idTag: storedTag,
    });
  });

  it('rejects start when the user disappears before the charging-identity lookup', async () => {
    const client = await login();
    repository.findOne
      .mockResolvedValueOnce({ id: 'user-1', email: credentials.email })
      .mockResolvedValueOnce(null);

    await client
      .post('/chargers/CP_001/start')
      .send({ connectorId: 1 })
      .expect(401);

    expect(repository.findOne).toHaveBeenCalledTimes(2);
    expect(repository.findOne).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-1' },
      select: { idTag: true },
    });
    expect(ocpp.remoteStartTransaction).not.toHaveBeenCalled();
    expect(ocpp.remoteStopTransaction).not.toHaveBeenCalled();
    expect(ocpp.getActiveSession).not.toHaveBeenCalled();
  });

  it('sends no command when the charging-identity lookup fails', async () => {
    const client = await login();
    repository.findOne
      .mockResolvedValueOnce({ id: 'user-1', email: credentials.email })
      .mockRejectedValueOnce(new Error('Database unavailable'));

    await client
      .post('/chargers/CP_001/start')
      .send({ connectorId: 1 })
      .expect(500);

    expect(repository.findOne).toHaveBeenCalledTimes(2);
    expect(repository.findOne).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-1' },
      select: { idTag: true },
    });
    expect(ocpp.remoteStartTransaction).not.toHaveBeenCalled();
    expect(ocpp.remoteStopTransaction).not.toHaveBeenCalled();
    expect(ocpp.getActiveSession).not.toHaveBeenCalled();
  });

  it('rejects a user from stopping another users session', async () => {
    const client = await login();

    ocpp.getActiveSession.mockResolvedValueOnce({
      transactionId: 42,
      userId: 'user-2',
    });

    await client.post('/chargers/CP_001/connector/1/stop').expect(403);

    expect(ocpp.getActiveSession).toHaveBeenCalledWith('CP_001', 1);
    expect(ocpp.remoteStopTransaction).not.toHaveBeenCalled();
  });
  it('rejects a user from stopping an unowned session', async () => {
    const client = await login();

    ocpp.getActiveSession.mockResolvedValueOnce({
      transactionId: 42,
      userId: null,
    });

    await client.post('/chargers/CP_001/connector/1/stop').expect(403);

    expect(ocpp.getActiveSession).toHaveBeenCalledWith('CP_001', 1);
    expect(ocpp.remoteStopTransaction).not.toHaveBeenCalled();
  });
});
