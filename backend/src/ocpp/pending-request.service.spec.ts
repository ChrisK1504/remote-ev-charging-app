import { WebSocket } from 'ws';
import { PendingRequestService } from './pending-request.service';

describe('PendingRequestService lifecycle', () => {
  let service: PendingRequestService;
  let socketA: WebSocket;
  let socketB: WebSocket;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new PendingRequestService();
    socketA = {} as WebSocket;
    socketB = {} as WebSocket;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('rejects every request on the disconnected socket and preserves other sockets', async () => {
    const first = service.register('a1', socketA, 'RemoteStartTransaction');
    const second = service.register('a2', socketA, 'RemoteStopTransaction');
    const other = service.register('b', socketB, 'RemoteStartTransaction');
    const error = new Error('Socket disconnected');
    const firstRejected = expect(first).rejects.toBe(error);
    const secondRejected = expect(second).rejects.toBe(error);
    const otherSettled = jest.fn();
    void other.then(otherSettled, otherSettled);

    service.rejectForSocket(socketA, error);
    await Promise.all([firstRejected, secondRejected]);

    expect(service.getAction('a1', socketA)).toBeUndefined();
    expect(service.getAction('a2', socketA)).toBeUndefined();
    expect(service.getAction('b', socketB)).toBe('RemoteStartTransaction');
    expect(otherSettled).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(1);

    service.resolve('b', socketB, { status: 'Accepted' });
    await expect(other).resolves.toEqual({ status: 'Accepted' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timer when a response resolves the request before disconnect', async () => {
    const request = service.register('a', socketA, 'RemoteStartTransaction');
    service.resolve('a', socketA, { status: 'Accepted' });
    service.rejectForSocket(socketA, new Error('Socket disconnected'));

    await expect(request).resolves.toEqual({ status: 'Accepted' });
    expect(service.getAction('a', socketA)).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timer on explicit rejection', async () => {
    const request = service.register('a', socketA, 'RemoteStopTransaction');
    const error = new Error('Send failed');
    const rejected = expect(request).rejects.toBe(error);
    service.reject('a', socketA, error);

    await rejected;
    expect(service.getAction('a', socketA)).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('leaves the request and timer intact for responses from a foreign socket', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const request = service.register('a', socketA, 'RemoteStartTransaction');
    service.resolve('a', socketB, { status: 'Accepted' });
    service.reject('a', socketB, new Error('Foreign rejection'));
    service.rejectForSocket(socketB, new Error('Other socket disconnected'));

    expect(service.getAction('a', socketA)).toBe('RemoteStartTransaction');
    expect(jest.getTimerCount()).toBe(1);
    const rejected = expect(request).rejects.toThrow(
      'RemoteStartTransaction timed out',
    );
    jest.advanceTimersByTime(10_000);
    await rejected;
    expect(service.getAction('a', socketA)).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores late responses and repeated disconnect cleanup after rejection', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const request = service.register('a', socketA, 'RemoteStartTransaction');
    const error = new Error('Socket disconnected');
    const rejected = expect(request).rejects.toBe(error);
    service.rejectForSocket(socketA, error);
    service.resolve('a', socketA, { status: 'Accepted' });
    service.rejectForSocket(socketA, new Error('Repeated disconnect'));
    jest.advanceTimersByTime(10_000);

    await rejected;
    expect(service.getAction('a', socketA)).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
});
