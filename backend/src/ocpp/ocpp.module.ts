import { Module } from '@nestjs/common';
import { OcppServerService } from './ocpp-server.service';
import { ChargeStateService } from './charger-state.service';

@Module({
  providers: [OcppServerService, ChargeStateService],
  exports: [OcppServerService],
})
export class OcppModule {}
