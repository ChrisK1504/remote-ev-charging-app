import { Module } from '@nestjs/common';
import { OcppServerService } from './ocpp-server.service';

@Module({
  providers: [OcppServerService],
  exports: [OcppServerService],
})
export class OcppModule {}
