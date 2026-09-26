import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocketServer } from 'ws';

@Injectable()
export class OcppServerService implements OnModuleInit, OnModuleDestroy {
  private wss: WebSocketServer;

  onModuleInit() {
    this.wss = new WebSocketServer({
      port: 9000,
      handleProtocols: (protocols) => {
        if (protocols.has('ocpp1.6')) {
          return 'ocpp1.6';
        }

        return false;
      },
    });

    this.wss.on('connection', (socket, request) => {
      const chargePointId = request.url?.split('/').pop();
      console.log('WebSocket connection received');
      console.log('URL:', request.url);
      console.log('Charge Point ID:', chargePointId);
      console.log('Protocol:', socket.protocol);

      socket.on('message', (data) => {
        console.log('MESSAGE:', data.toString());
        const message = JSON.parse(data.toString());

        const [messageTypeId, messageId, action, payload] = message;

        if (messageTypeId === 2) {
          switch (action) {
            case 'BootNotification':
              {
                console.log(
                  `${chargePointId} BootNotification: ${JSON.stringify(payload)}\n`,
                );
                const response = [
                  3,
                  // The same messageId is reused
                  messageId,
                  {
                    status: 'Accepted',
                    currenTime: new Date().toISOString(),
                    interval: 2,
                  },
                ];
                socket.send(JSON.stringify(response));
                console.log('BootNotification accepted');
              }
              break;
            case 'Heartbeat':
              {
                console.log(`${chargePointId} HeartBeat`);
                const response = [
                  3,
                  messageId,
                  {
                    currentTime: new Date().toISOString(),
                  },
                ];

                socket.send(JSON.stringify(response));
                console.log('Heartbeat responded');
              }
              break;
            case 'StatusNotification':
              console.log(
                `${chargePointId} connector ${payload.connectorId}: ${payload.status}`,
              );

              socket.send(JSON.stringify([3, messageId, {}]));
              break;
          }
        }
      });

      socket.on('close', () => {
        console.log('Charge point disconnected');
      });

      socket.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }
  onModuleDestroy() {
    this.wss.close();
  }
}
