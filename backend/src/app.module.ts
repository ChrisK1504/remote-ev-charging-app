import { Module } from '@nestjs/common';
import { OcppModule } from './ocpp/ocpp.module';
import { ChargerModule } from './charger/charger.module';

@Module({
  imports: [OcppModule, ChargerModule],
})
export class AppModule {}
