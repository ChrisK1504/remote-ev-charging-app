import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChargingSession } from './charging-session.entity';
import { SessionService } from './session.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChargingSession])],
  exports: [TypeOrmModule, SessionService],
  providers: [SessionService],
})
export class SessionModule {}
