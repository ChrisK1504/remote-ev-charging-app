import { Module } from '@nestjs/common';
import { OcppServerService } from './ocpp-server.service';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerService } from './connection-manager.service';
import { SessionModule } from '../session/session.module';
import { PendingRequestService } from './pending-request.service';

@Module({
  imports: [SessionModule],
  providers: [
    OcppServerService,
    ChargeStateService,
    ConnectionManagerService,
    PendingRequestService,
  ],
  exports: [OcppServerService, ChargeStateService],
})
export class OcppModule {}
