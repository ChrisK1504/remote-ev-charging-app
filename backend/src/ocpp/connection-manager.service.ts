import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';

@Injectable()
export class ConnectionManagerService {
  private readonly connections = new Map<string, WebSocket>();

  add(chargePointId: string, socket: WebSocket): void {
    const oldConnection = this.get(chargePointId);

    this.connections.set(chargePointId, socket);
    if (oldConnection) {
      oldConnection.close();
    }
  }

  remove(chargePointId: string): void {
    this.connections.delete(chargePointId);
  }

  get(chargePointId: string): WebSocket | undefined {
    return this.connections.get(chargePointId);
  }
}
