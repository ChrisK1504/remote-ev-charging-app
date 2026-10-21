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

  async getCurrentUser(userId: string | undefined) {
    if (!userId) {
      throw new UnauthorizedException();
    }

    const user = await this.userService.findById({ id: userId });
    if (!user) {
      throw new UnauthorizedException();
    }

    return { id: user.id, email: user.email };
  }
}
