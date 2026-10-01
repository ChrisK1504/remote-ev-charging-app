import { Module } from '@nestjs/common';
import { OcppServerService } from './ocpp-server.service';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerServie } from './connection-manager.service';

@Module({
  providers: [OcppServerService, ChargeStateService, ConnectionManagerServie],
  exports: [OcppServerService, ChargeStateService],
})
export class OcppModule {}
