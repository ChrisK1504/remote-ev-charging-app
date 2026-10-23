import { Module } from '@nestjs/common';
import { OcppModule } from '../ocpp/ocpp.module';
import { ChargerController } from './charger.controller';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [OcppModule, AuthModule, UserModule],
  controllers: [ChargerController],
})
export class ChargerModule {}
