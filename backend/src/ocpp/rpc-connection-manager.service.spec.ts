import { Logger } from '@nestjs/common';
import type RPCServerClient from 'ocpp-rpc/lib/server-client';
import { RpcConnectionManagerService } from './rpc-connection-manager.service';

function makeClient(identity: string) {
  return {
    identity,
    close: jest.fn().mockResolvedValue(undefined),
  };
}

describe('RpcConnectionManagerService', () => {
  it('stores the replacement before closing the old client and ignores its removal', () => {
    const manager = new RpcConnectionManagerService();
    const old = makeClient('CP_A');
    const current = makeClient('CP_A');
    const other = makeClient('CP_B');
    const oldClient = old as unknown as RPCServerClient;
    const currentClient = current as unknown as RPCServerClient;
    const otherClient = other as unknown as RPCServerClient;
    manager.add(oldClient);
    manager.add(otherClient);
    old.close.mockImplementation(() => {
      expect(manager.get('CP_A')).toBe(currentClient);
      manager.removeIfCurrent('CP_A', oldClient);
      return Promise.resolve();
    });

    manager.add(currentClient);
    manager.removeIfCurrent('CP_A', oldClient);

    expect(old.close).toHaveBeenCalledWith({
      code: 1000,
      reason: 'Connection replaced',
    });
    expect(manager.get('CP_A')).toBe(currentClient);
    expect(manager.get('CP_B')).toBe(otherClient);
    expect(other.close).not.toHaveBeenCalled();

    manager.removeIfCurrent('CP_A', currentClient);
    manager.removeIfCurrent('CP_A', currentClient);
    expect(manager.get('CP_A')).toBeUndefined();
    expect(manager.get('CP_B')).toBe(otherClient);
  });

  it('does not close a client registered twice', () => {
    const manager = new RpcConnectionManagerService();
    const client = makeClient('CP_A');
    manager.add(client as unknown as RPCServerClient);
    manager.add(client as unknown as RPCServerClient);
    expect(client.close).not.toHaveBeenCalled();
    expect(manager.get('CP_A')).toBe(client);
  });

  it('logs rejected close attempts without losing the replacement', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      const manager = new RpcConnectionManagerService();
      const old = makeClient('CP_A');
      const current = makeClient('CP_A');
      old.close.mockRejectedValue(new Error('Close failed'));
      manager.add(old as unknown as RPCServerClient);
      manager.add(current as unknown as RPCServerClient);

      await Promise.resolve();

      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('CP_A: Error: Close failed'),
      );
      expect(manager.get('CP_A')).toBe(current);
    } finally {
      warning.mockRestore();
    }
  });
});
