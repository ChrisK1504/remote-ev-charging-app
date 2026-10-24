import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';
import { OcppActionMap } from './ocpp.types';

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  socket: WebSocket;
  action: keyof OcppActionMap;
  timer: ReturnType<typeof setTimeout>;
}

@Injectable()
export class PendingRequestService {
  private readonly pendingRequests = new Map<string, PendingRequest>();

  // register a new pending request, with a 10 second time-out
  register(
    messageId: string,
    socket: WebSocket,
    action: keyof OcppActionMap,
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pendingRequests.get(messageId);
        if (!pending) return;

        this.pendingRequests.delete(messageId);
        pending.reject(new Error(`${action} timed out`));
      }, 10000);
      this.pendingRequests.set(messageId, {
        resolve,
        reject,
        socket,
        action,
        timer,
      });
    });
  }

  getAction(
    messageId: string,
    socket: WebSocket,
  ): keyof OcppActionMap | undefined {
    const pending = this.pendingRequests.get(messageId);
    return pending?.socket === socket ? pending.action : undefined;
  }

  // resolve a successful response
  resolve(messageId: string, socket: WebSocket, payload: unknown): void {
    const pending = this.pendingRequests.get(messageId);

    if (!pending || pending.socket !== socket) {
      console.warn(`No pending requests for ${messageId}`);
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(messageId);
    pending.resolve(payload);
  }

  // reject a pending request
  reject(messageId: string, socket: WebSocket, error: Error): void {
    const pending = this.pendingRequests.get(messageId);
    if (!pending || pending.socket !== socket) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(messageId);
    pending.reject(error);
  }

  // reject all pending requests of a socket in case of a socket close
  rejectForSocket(socket: WebSocket, error: Error): void {
    for (const [messageId, pending] of this.pendingRequests.entries()) {
      if (pending.socket === socket) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(messageId);
        pending.reject(error);
      }
    }
  }
}
