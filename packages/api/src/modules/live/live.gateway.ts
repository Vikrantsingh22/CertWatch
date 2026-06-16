import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/live' })
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    // Stub implementation
  }

  handleDisconnect(client: Socket) {
    // Stub implementation
  }

  emitDomainFlagged(domain: any) {
    this.server.emit('domain:flagged', domain);
  }

  emitMetricsUpdate(metrics: any) {
    this.server.emit('metrics:update', metrics);
  }
}
