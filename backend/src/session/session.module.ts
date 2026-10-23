import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChargingSession } from './charging-session.entity';
import { SessionService } from './session.service';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([ChargingSession]), UserModule],
  exports: [TypeOrmModule, SessionService],
  providers: [SessionService],
})
export class SessionModule {}
