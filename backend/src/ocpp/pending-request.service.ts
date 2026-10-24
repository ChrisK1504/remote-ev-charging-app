import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  socket: WebSocket;
}

@Injectable()
export class PendingRequestService {
  private readonly pendingRequests = new Map<string, PendingRequest>();

  // register a new pending request, with a 10 second time-out
  register(
    messageId: string,
    socket: WebSocket,
    action: string,
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(messageId, {
        resolve,
        reject,
        socket,
      });

      setTimeout(() => {
        const pending = this.pendingRequests.get(messageId);
        if (!pending) return;

        this.pendingRequests.delete(messageId);
        pending.reject(new Error(`${action} timed out`));
      }, 10000);
    });
  }

  // resolve a successful response
  resolve(messageId: string, socket: WebSocket, payload: unknown): void {
    const pending = this.pendingRequests.get(messageId);

    if (!pending || pending.socket !== socket) {
      console.warn(`No pending requests for ${messageId}`);
      return;
    }

    this.pendingRequests.delete(messageId);
    pending.resolve(payload);
  }

  // reject a pending request
  reject(messageId: string, socket: WebSocket, error: Error): void {
    const pending = this.pendingRequests.get(messageId);
    if (!pending || pending.socket !== socket) return;

    this.pendingRequests.delete(messageId);
    pending.reject(error);
  }
}
