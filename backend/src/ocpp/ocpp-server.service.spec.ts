import { WebSocket } from 'ws';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerServie } from './connection-manager.service';
import { OcppServerService } from './ocpp-server.service';
import { json } from 'stream/consumers';

describe('StopTransaction ownership', () => {
  it('preserves CP_A’s transaction when CP_B tries to stop it', async () => {
    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerServie(),
    );

    const sendA = jest.fn();
    const sendB = jest.fn();

    const socketA = { send: sendA } as unknown as WebSocket;
    const socketB = { send: sendB } as unknown as WebSocket;

    await service['handleMessage'](
      'CP_A',
      socketA,
      JSON.stringify([
        2,
        'start-a',
        'StartTransaction',
        {
          connectorId: 1,
          idTag: 'TEST',
          meterStart: 100,
          timestamp: '2026-10-13T10:00:00Z',
        },
      ]),
    );

    const originalTransaction = service.getActiveTransaction('CP_A', 1);
    expect(originalTransaction).toBeDefined();

    const expectedTransaction = { ...originalTransaction };

    const startReply = JSON.parse(sendA.mock.calls[0][0]);
    const transactionId = startReply[2].transactionId;

    await service['handleMessage'](
      'CP_B',
      socketB,
      JSON.stringify([
        2,
        'stop-b',
        'StopTransaction',
        {
          meterStop: 200,
          transactionId,
          timestamp: '2026-10-13T10:05:00Z',
        },
      ]),
    );

    expect(service.getActiveTransaction('CP_A', 1)).toEqual(
      expectedTransaction,
    );

    expect(sendB).toHaveBeenCalledTimes(1);
    expect(sendB).toHaveBeenCalledWith(JSON.stringify([3, 'stop-b', {}]));
  });

  it('stops CP_A transaction when CP_A tries to stop it', async () => {
    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerServie(),
    );

    const sendA = jest.fn();

    const socketA = { send: sendA } as unknown as WebSocket;

    await service['handleMessage'](
      'CP_A',
      socketA,
      JSON.stringify([
        2,
        'start-a',
        'StartTransaction',
        {
          connectorId: 1,
          idTag: 'TEST',
          meterStart: 100,
          timestamp: '2026-10-13T10:00:00Z',
        },
      ]),
    );

    const originalTransaction = service.getActiveTransaction('CP_A', 1);
    expect(originalTransaction).toBeDefined();

    const startReply = JSON.parse(sendA.mock.calls[0][0]);
    const transactionId = startReply[2].transactionId;

    await service['handleMessage'](
      'CP_A',
      socketA,
      JSON.stringify([
        2,
        'stop-a',
        'StopTransaction',
        {
          meterStop: 200,
          transactionId,
          timestamp: '2026-10-13T10:05:00Z',
        },
      ]),
    );

    expect(sendA).toHaveBeenCalledTimes(2);
    expect(sendA).toHaveBeenNthCalledWith(2, JSON.stringify([3, 'stop-a', {}]));
    expect(service.getActiveTransaction('CP_A', 1)).toBeUndefined();
  });

  it('an unknown transactionId cannot damage an existing session', async () => {
    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerServie(),
    );

    const sendA = jest.fn();

    const socketA = { send: sendA } as unknown as WebSocket;

    await service['handleMessage'](
      'CP_A',
      socketA,
      JSON.stringify([
        2,
        'start-a',
        'StartTransaction',
        {
          connectorId: 1,
          idTag: 'TEST',
          meterStart: 100,
          timestamp: '2026-10-13T10:00:00Z',
        },
      ]),
    );

    const originalTransaction = service.getActiveTransaction('CP_A', 1);
    expect(originalTransaction).toBeDefined();

    const startReply = JSON.parse(sendA.mock.calls[0][0]);
    const transactionId = startReply[2].transactionId;

    const expectedTransaction = { ...originalTransaction };

    await service['handleMessage'](
      'CP_A',
      socketA,
      JSON.stringify([
        2,
        'stop-a',
        'StopTransaction',
        {
          meterStop: 200,
          transactionId: transactionId + 1,
          timestamp: '2026-10-13T10:05:00Z',
        },
      ]),
    );

    expect(sendA).toHaveBeenCalledTimes(2);
    expect(sendA).toHaveBeenNthCalledWith(2, JSON.stringify([3, 'stop-a', {}]));
    expect(service.getActiveTransaction('CP_A', 1)).toEqual(
      expectedTransaction,
    );
  });

  it('repeated stop request with the same transactionID does not affect state further', async () => {
    const service = new OcppServerService(
      new ChargeStateService(),
      new ConnectionManagerServie(),
    );

    const sendA = jest.fn();

    const socketA = { send: sendA } as unknown as WebSocket;

    await service['handleMessage'](
      'CP_A',
      socketA,
      JSON.stringify([
        2,
        'start-a',
        'StartTransaction',
        {
          connectorId: 1,
          idTag: 'TEST',
          meterStart: 100,
          timestamp: '2026-10-13T10:00:00Z',
        },
      ]),
    );

    const originalTransaction = service.getActiveTransaction('CP_A', 1);
    expect(originalTransaction).toBeDefined();

    const startReply = JSON.parse(sendA.mock.calls[0][0]);
    const transactionId = startReply[2].transactionId;

    const expectedTransaction = { ...originalTransaction };

    await service['handleMessage'](
      'CP_A',
      socketA,
      JSON.stringify([
        2,
        'stop-1a',
        'StopTransaction',
        {
          meterStop: 200,
          transactionId: transactionId,
          timestamp: '2026-10-13T10:05:00Z',
        },
      ]),
    );

    expect(service.getActiveTransaction('CP_A', 1)).toBeUndefined();

    await service['handleMessage'](
      'CP_A',
      socketA,
      JSON.stringify([
        2,
        'stop-2a',
        'StopTransaction',
        {
          meterStop: 200,
          transactionId: transactionId,
          timestamp: '2026-10-13T10:05:00Z',
        },
      ]),
    );

    expect(sendA).toHaveBeenCalledTimes(3);
    expect(sendA).toHaveBeenNthCalledWith(
      1,
      JSON.stringify([
        3,
        'start-a',
        {
          transactionId,
          idTagInfo: {
            status: 'Accepted',
          },
        },
      ]),
    );

    expect(sendA).toHaveBeenNthCalledWith(
      2,
      JSON.stringify([3, 'stop-1a', {}]),
    );
    expect(sendA).toHaveBeenNthCalledWith(
      3,
      JSON.stringify([3, 'stop-2a', {}]),
    );
    expect(service.getActiveTransaction('CP_A', 1)).toBeUndefined();
  });
});
