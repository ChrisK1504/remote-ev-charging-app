import { Module } from '@nestjs/common';
import { ChargeStateService } from './charger-state.service';
import { SessionModule } from '../session/session.module';
import { UserModule } from '../users/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChargerService } from './charger.service';
import { Charger } from './charger.entity';
import { OcppRpcServerService } from './ocpp-rpc-server.service';
import { RpcConnectionManagerService } from './rpc-connection-manager.service';

@Module({
  imports: [SessionModule, UserModule, TypeOrmModule.forFeature([Charger])],
  providers: [
    ChargeStateService,
    ChargerService,
    OcppRpcServerService,
    RpcConnectionManagerService,
  ],
  exports: [OcppRpcServerService, ChargeStateService],
})
export class OcppModule {}
