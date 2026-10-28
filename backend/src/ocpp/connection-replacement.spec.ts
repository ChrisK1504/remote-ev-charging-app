import { ChargerService } from './charger.service';
import { UserService } from '../users/user.service';
import { EventEmitter } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerService } from './connection-manager.service';
import { OcppServerService } from './ocpp-server.service';
import { PendingRequestService } from './pending-request.service';
import { OcppCallHandlersService } from './ocpp-call-handlers.service';
import { SessionService } from '../session/session.service';

jest.mock('ws', () => ({
  ...jest.requireActual('ws'),
  WebSocketServer: jest.fn(),
}));

it('preserves the new connection when the old socket closes', () => {
  const server = new EventEmitter();

  jest
    .mocked(WebSocketServer)
    .mockImplementation(() => server as unknown as WebSocketServer);

  const state = new ChargeStateService();
  const connections = new ConnectionManagerService();
  const sessions = {} as SessionService;

  const service = new OcppServerService(
    state,
    connections,
    sessions,
    new PendingRequestService(),
    new OcppCallHandlersService(
      state,
      sessions,
      {
        findByIdTag: jest.fn(),
      } as unknown as UserService,
      {
        registerOrUpdate: jest.fn().mockResolvedValue(undefined),
      } as unknown as ChargerService,
    ),
  );

  const socketA = Object.assign(new EventEmitter(), {
    close: jest.fn(),
    send: jest.fn(),
    readyState: WebSocket.OPEN,
  });

  const socketB = Object.assign(new EventEmitter(), {
    close: jest.fn(),
    send: jest.fn(),
    readyState: WebSocket.OPEN,
  });

  service.onModuleInit();

  server.emit('connection', socketA, { url: '/ocpp/CP_A' });
  server.emit('connection', socketB, { url: '/ocpp/CP_A' });

  expect(socketA.close).toHaveBeenCalledTimes(1);
  expect(connections.get('CP_A')).toBe(socketB);

  socketB.emit(
    'message',
    Buffer.from(
      JSON.stringify([
        2,
        'status-b',
        'StatusNotification',
        {
          connectorId: 1,
          status: 'Charging',
          errorCode: 'NoError',
        },
      ]),
    ),
  );

  const socketState = state.get('CP_A')?.connectors.get(1)?.status;
  expect(socketState).toEqual('Charging');

  socketA.emit(
    'message',
    Buffer.from(
      JSON.stringify([
        2,
        'status-a',
        'StatusNotification',
        {
          connectorId: 1,
          status: 'Available',
          errorCode: 'NoError',
        },
      ]),
    ),
  );
  expect(state.get('CP_A')?.connectors.get(1)?.status).toBe('Charging');

  socketA.emit('close');

  expect(connections.get('CP_A')).toBe(socketB);
  expect(state.get('CP_A')?.connected).toBe(true);
});
