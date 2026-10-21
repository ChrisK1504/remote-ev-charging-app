import { Module } from '@nestjs/common';
import { OcppModule } from '../ocpp/ocpp.module';
import { ChargerController } from './charger.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [OcppModule, AuthModule],
  controllers: [ChargerController],
})
export class ChargerModule {}
