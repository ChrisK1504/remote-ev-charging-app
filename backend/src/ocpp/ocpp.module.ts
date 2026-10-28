import { Module } from '@nestjs/common';
import { OcppServerService } from './ocpp-server.service';
import { ChargeStateService } from './charger-state.service';
import { ConnectionManagerService } from './connection-manager.service';
import { SessionModule } from '../session/session.module';
import { OcppCallHandlersService } from './ocpp-call-handlers.service';
import { PendingRequestService } from './pending-request.service';
import { UserModule } from '../users/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChargerService } from './charger.service';
import { Charger } from './charger.entity';

@Module({
  imports: [SessionModule, UserModule, TypeOrmModule.forFeature([Charger])],
  providers: [
    OcppServerService,
    ChargeStateService,
    ConnectionManagerService,
    PendingRequestService,
    OcppCallHandlersService,
    ChargerService,
  ],
  exports: [OcppServerService, ChargeStateService],
})
export class OcppModule {}
