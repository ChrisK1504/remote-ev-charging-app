import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OcppModule } from './ocpp/ocpp.module';
import { ChargerModule } from './charger/charger.module';

@Module({
  imports: [OcppModule, ChargerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
