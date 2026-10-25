import { Module } from '@nestjs/common';
import { OcppServerService } from './ocpp-server.service';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerService } from './connection-manager.service';
import { SessionModule } from '../session/session.module';
import { OcppCallHandlersService } from './ocpp-call-handlers.service';
import { PendingRequestService } from './pending-request.service';
import { UserModule } from '../users/user.module';

@Module({
  imports: [SessionModule, UserModule],
  providers: [
    OcppServerService,
    ChargeStateService,
    ConnectionManagerService,
    PendingRequestService,
    OcppCallHandlersService,
  ],
  exports: [OcppServerService, ChargeStateService],
})
export class OcppModule {}
