import { Module } from '@nestjs/common';
import { UserModule } from 'src/users/user.module';
import { AuthService } from './auth.service';

@Module({
  imports: [UserModule],
  exports: [AuthService],
  providers: [AuthService],
})
export class AuthModule {}
