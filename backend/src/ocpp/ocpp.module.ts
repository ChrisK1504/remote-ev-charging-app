import { Module } from '@nestjs/common';
import { OcppServerService } from './ocpp-server.service';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerService } from './connection-manager.service';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  providers: [OcppServerService, ChargeStateService, ConnectionManagerService],
  exports: [OcppServerService, ChargeStateService],
})
export class OcppModule {}
