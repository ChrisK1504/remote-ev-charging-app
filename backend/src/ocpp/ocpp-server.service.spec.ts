import { WebSocket } from 'ws';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerService } from './connection-manager.service';
import { OcppServerService } from './ocpp-server.service';
import { SessionService } from '../session/session.service';
import { ChargingSession } from 'src/session/charging-session.entity';

describe('StopTransaction case', () => {
  it('passes the sending charger’s identity when completing a transaction', async () => {
    const complete = jest.fn().mockResolvedValue(false);

    const sessions = {
      complete,
    } as unknown as SessionService;

    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerService(),
      sessions,
    );

    const sendB = jest.fn();
    const socketB = { send: sendB } as unknown as WebSocket;

    await service['handleMessage'](
      'CP_B',
      socketB,
      JSON.stringify([
        2,
        'stop-b',
        'StopTransaction',
        {
          transactionId: 42,
          meterStop: 200,
          timestamp: '2026-10-14T10:05:00Z',
        },
      ]),
    );

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith({
      transactionId: 42,
      chargePointId: 'CP_B',
      endedAt: new Date('2026-10-14T10:05:00Z'),
      meterStop: 200,
    });

    expect(sendB).toHaveBeenCalledTimes(1);
    expect(sendB).toHaveBeenCalledWith(JSON.stringify([3, 'stop-b', {}]));
  });

  it('acknowledges a successfully completed transaction', async () => {
    const complete = jest.fn().mockResolvedValue(true);
    const sessions = { complete } as unknown as SessionService;

    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerService(),
      sessions,
    );

    const send = jest.fn();

    const socketA = { send: send } as unknown as WebSocket;

    await service['handleMessage'](
      'CP_A',
      socketA,
      JSON.stringify([
        2,
        'stop-a',
        'StopTransaction',
        {
          meterStop: 200,
          transactionId: 42,
          timestamp: '2026-10-13T10:05:00Z',
        },
      ]),
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(JSON.stringify([3, 'stop-a', {}]));
  });

  it('does not acknowledge a stop when persistence fails', async () => {
    const databaseError = new Error('Database unavailable');
    const complete = jest.fn().mockRejectedValue(databaseError);
    const sessions = { complete } as unknown as SessionService;
    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerService(),
      sessions,
    );

    const send = jest.fn();

    const socket = { send: send } as unknown as WebSocket;

    await expect(
      service['handleMessage'](
        'CP_A',
        socket,
        JSON.stringify([
          2,
          'stop-a',
          'StopTransaction',
          {
            meterStop: 200,
            transactionId: 42,
            timestamp: '2026-10-13T10:05:00Z',
          },
        ]),
      ),
    ).rejects.toBe(databaseError);

    expect(send).not.toHaveBeenCalled();
  });

  it('acknowledges both the initial and repeated stop messages', async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const sessions = { complete } as unknown as SessionService;

    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerService(),
      sessions,
    );

    const send = jest.fn();
    const socket = { send } as unknown as WebSocket;

    for (const messageId of ['stop-1a', 'stop-2a']) {
      await service['handleMessage'](
        'CP_A',
        socket,
        JSON.stringify([
          2,
          messageId,
          'StopTransaction',
          {
            transactionId: 42,
            meterStop: 200,
            timestamp: '2026-10-14T10:05:00Z',
          },
        ]),
      );
    }

    expect(complete).toHaveBeenCalledTimes(2);

    const expectedInput = {
      transactionId: 42,
      chargePointId: 'CP_A',
      endedAt: new Date('2026-10-14T10:05:00Z'),
      meterStop: 200,
    };

    expect(complete).toHaveBeenNthCalledWith(1, expectedInput);
    expect(complete).toHaveBeenNthCalledWith(2, expectedInput);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, JSON.stringify([3, 'stop-1a', {}]));
    expect(send).toHaveBeenNthCalledWith(2, JSON.stringify([3, 'stop-2a', {}]));
  });
});

describe('StartTransaction case', () => {
  it('sends response after persistence completion', async () => {
    let resolveStart!: (session: ChargingSession) => void;

    const persistence = new Promise<ChargingSession>((resolve) => {
      resolveStart = resolve;
    });

    const send = jest.fn();
    const socket = { send } as unknown as WebSocket;

    const start = jest.fn().mockReturnValue(persistence);
    const sessions = { start } as unknown as SessionService;

    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerService(),
      sessions,
    );

    const handling = service['handleMessage'](
      'CP_A',
      socket,
      JSON.stringify([
        2,
        'start-a',
        'StartTransaction',
        {
          connectorId: 1,
          idTag: 'TEST',
          meterStart: 200,
          timestamp: '2026-10-14T10:05:00Z',
        },
      ]),
    );

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({
      chargePointId: 'CP_A',
      connectorId: 1,
      idTag: 'TEST',
      meterStart: 200,
      startedAt: new Date('2026-10-14T10:05:00Z'),
    });
    expect(send).not.toHaveBeenCalled();

    resolveStart({ transactionId: 42 } as ChargingSession);
    await handling;

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      JSON.stringify([
        3,
        'start-a',
        {
          transactionId: 42,
          idTagInfo: { status: 'Accepted' },
        },
      ]),
    );
  });

  it('does not send a response when persistence fails', async () => {
    const send = jest.fn();
    const socket = { send } as unknown as WebSocket;

    const databaseError = new Error('Database unavailable');
    const start = jest.fn().mockRejectedValue(databaseError);
    const sessions = { start } as unknown as SessionService;

    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerService(),
      sessions,
    );

    await expect(
      service['handleMessage'](
        'CP_A',
        socket,
        JSON.stringify([
          2,
          'start-a',
          'StartTransaction',
          {
            connectorId: 1,
            idTag: 'TEST',
            meterStart: 200,
            timestamp: '2026-10-14T10:05:00Z',
          },
        ]),
      ),
    ).rejects.toBe(databaseError);

    expect(start).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not acknowledge StartTransaction when persistence rejects with an active-session conflict', async () => {
    const send = jest.fn();
    const socket = { send } as unknown as WebSocket;
    const databaseError = Object.assign(new Error('duplicate active session'), {
      code: '23505',
      constraint: 'idx_active_session_per_connector',
    });

    const start = jest.fn().mockRejectedValue(databaseError);
    const sessionService = { start } as unknown as SessionService;

    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerService(),
      sessionService,
    );

    await expect(
      service['handleMessage'](
        'CP-A',
        socket,
        JSON.stringify([
          2,
          'start-a',
          'StartTransaction',
          {
            connectorId: 1,
            idTag: 'TEST',
            meterStart: 200,
            timestamp: '2026-10-14T10:05:00Z',
          },
        ]),
      ),
    ).rejects.toBe(databaseError);
    expect(send).not.toHaveBeenCalled();
  });
});
