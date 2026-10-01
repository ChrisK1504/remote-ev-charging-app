import { Module } from '@nestjs/common';
import { OcppModule } from '../ocpp/ocpp.module';
import { ChargerController } from './charger.controller';

@Module({
  imports: [OcppModule],
  controllers: [ChargerController],
})
export class ChargerModule {}
