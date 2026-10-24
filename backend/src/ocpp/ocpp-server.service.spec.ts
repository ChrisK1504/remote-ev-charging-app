import { WebSocket } from 'ws';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerService } from './connection-manager.service';
import { OcppServerService } from './ocpp-server.service';
import {
  ActiveSessionConflictError,
  SessionService,
} from '../session/session.service';
import { BadGatewayException } from '@nestjs/common';
import { PendingRequestService } from './pending-request.service';

describe('StopTransaction', () => {
  it('passes the sending charger’s identity when completing a transaction', async () => {
    const complete = jest.fn().mockResolvedValue(false);

    const sessions = {
      complete,
    } as unknown as SessionService;

    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerService(),
      sessions,
      new PendingRequestService(),
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
      new PendingRequestService(),
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
      new PendingRequestService(),
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
      new PendingRequestService(),
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
    type Outcome = Awaited<ReturnType<SessionService['start']>>;
    let resolveStart!: (outcome: Outcome) => void;

    const persistence = new Promise<Outcome>((resolve) => {
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
      new PendingRequestService(),
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

    resolveStart({ transactionId: 42, authorizationStatus: 'Accepted' });
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
      new PendingRequestService(),
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

  it('returns a correlated CALLERROR for an active-session conflict', async () => {
    const send = jest.fn();
    const socket = { send } as unknown as WebSocket;
    const databaseError = new ActiveSessionConflictError();

    const start = jest.fn().mockRejectedValue(databaseError);
    const sessionService = { start } as unknown as SessionService;

    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerService(),
      sessionService,
      new PendingRequestService(),
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
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      JSON.stringify([
        4,
        'start-a',
        'GenericError',
        'Connector already has an active session',
        {},
      ]),
    );
  });
});

describe('Outbound command correlation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('ignores a response from a different socket', async () => {
    const sendA = jest.fn();
    const sendB = jest.fn();

    const socketA = {
      send: sendA,
      readyState: WebSocket.OPEN,
    } as unknown as WebSocket;

    const socketB = {
      send: sendB,
      readyState: WebSocket.OPEN,
    } as unknown as WebSocket;

    const connections = new ConnectionManagerService();
    connections.add('CP_A', socketA);

    const sessions = {} as SessionService;
    const service = new OcppServerService(
      new ChargeStateService(),
      connections,
      sessions,
      new PendingRequestService(),
    );

    const command = service.remoteStartTransaction('CP_A', {
      connectorId: 1,
      idTag: 'TEST',
    });

    expect(sendA).toHaveBeenCalledTimes(1);

    const sentMessage = JSON.parse(sendA.mock.calls[0][0] as string) as [
      number,
      string,
      string,
      unknown,
    ];

    const messageId = sentMessage[1];

    const onResolved = jest.fn();
    const onRejected = jest.fn();

    const observedCommand = command.then(onResolved, onRejected);

    await service['handleMessage'](
      'CP_B',
      socketB,
      JSON.stringify([3, messageId, { status: 'Rejected' }]),
    );

    expect(onResolved).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();

    await service['handleMessage'](
      'CP_A',
      socketA,
      JSON.stringify([3, messageId, { status: 'Accepted' }]),
    );

    await observedCommand;

    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledWith({ status: 'Accepted' });
    expect(onRejected).not.toHaveBeenCalled();
  });

  it('matches out of order responses to their commands', async () => {
    const send = jest.fn();
    const socket = {
      send,
      readyState: WebSocket.OPEN,
    } as unknown as WebSocket;

    const connections = new ConnectionManagerService();
    connections.add('CP_A', socket);

    const service = new OcppServerService(
      new ChargeStateService(),
      connections,
      {} as SessionService,
      new PendingRequestService(),
    );

    const startACommand = service.remoteStartTransaction('CP_A', {
      connectorId: 1,
      idTag: 'TEST',
    });

    const startBCommand = service.remoteStartTransaction('CP_A', {
      connectorId: 2,
      idTag: 'TEST2',
    });

    expect(send).toHaveBeenCalledTimes(2);

    const startAMessage = JSON.parse(send.mock.calls[0][0] as string);
    const startBMessage = JSON.parse(send.mock.calls[1][0] as string);

    const startAId = startAMessage[1] as string;
    const startBId = startBMessage[1] as string;

    expect(startAId).not.toBe(startBId);

    const onAResolved = jest.fn();
    const observedA = startACommand.then(onAResolved);

    await service['handleMessage'](
      'CP_A',
      socket,
      JSON.stringify([3, startBId, { status: 'Rejected' }]),
    );

    await expect(startBCommand).resolves.toEqual({
      status: 'Rejected',
    });

    expect(onAResolved).not.toHaveBeenCalled();

    await service['handleMessage'](
      'CP_A',
      socket,
      JSON.stringify([3, startAId, { status: 'Accepted' }]),
    );

    await observedA;

    expect(onAResolved).toHaveBeenCalledTimes(1);
    expect(onAResolved).toHaveBeenCalledWith({
      status: 'Accepted',
    });
  });

  it('rejects with CALLERROR', async () => {
    const send = jest.fn();
    const socket = { send, readyState: WebSocket.OPEN } as unknown as WebSocket;

    const connections = new ConnectionManagerService();
    connections.add('CP_A', socket);

    const service = new OcppServerService(
      new ChargeStateService(),
      connections,
      {} as SessionService,
      new PendingRequestService(),
    );

    const command = service.remoteStartTransaction('CP_A', {
      idTag: 'TEST',
      connectorId: 1,
    });

    expect(send).toHaveBeenCalledTimes(1);

    const startMessage = JSON.parse(send.mock.calls[0][0] as string);
    const messageId = startMessage[1] as string;

    const rejection =
      expect(command).rejects.toBeInstanceOf(BadGatewayException);

    await service['handleMessage'](
      'CP_A',
      socket,
      JSON.stringify([4, messageId, 'InternalError', 'Device failed', {}]),
    );
    await rejection;
  });
  it('times out', async () => {
    const send = jest.fn();
    const socket = { send, readyState: WebSocket.OPEN } as unknown as WebSocket;

    const connections = new ConnectionManagerService();
    connections.add('CP_A', socket);

    const service = new OcppServerService(
      new ChargeStateService(),
      connections,
      {} as SessionService,
      new PendingRequestService(),
    );

    const command = service.remoteStartTransaction('CP_A', {
      idTag: 'TEST',
      connectorId: 1,
    });

    expect(send).toHaveBeenCalledTimes(1);

    const rejection = expect(command).rejects.toThrow(
      'RemoteStartTransaction timed out',
    );

    jest.advanceTimersByTime(10_000);

    await rejection;
  });
});
