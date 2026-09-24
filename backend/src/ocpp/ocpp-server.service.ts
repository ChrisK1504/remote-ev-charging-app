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
      console.log('WebSocket connection received');
      console.log('URL:', request.url);
      console.log('Protocol:', socket.protocol);

      socket.on('message', (data) => {
        console.log('MESSAGE:', data.toString());
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
