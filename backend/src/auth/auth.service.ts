import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../users/user.service';

@Injectable()
export class AuthService {
  constructor(private readonly userService: UserService) {}

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ id: string; email: string }> {
    const user = await this.userService.verifyCredentials({
      email: input.email,
      password: input.password,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return { id: user.id, email: user.email };
  }
}
