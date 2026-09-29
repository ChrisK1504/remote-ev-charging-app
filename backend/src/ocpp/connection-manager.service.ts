import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';

@Injectable()
export class ConnectionManagerServie {
    private readonly connections = new Map<string, WebSocket>();
    
    add(chargePointId: string, socket: WebSocket): void {
        this.connections.set(chargePointId, socket);
    }

    remove(chargePointId: string): void {
        this.connections.delete(chargePointId);
    }

    get(chargePointId: string): WebSocket | undefined {
        return this.connections.get(chargePointId);
    }
}
