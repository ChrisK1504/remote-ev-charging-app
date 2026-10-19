import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(input: {
    email: string;
    password: string;
  }): Promise<{ id: string; email: string }> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const newUser = this.userRepository.create({
      id: randomUUID(),
      email: normalizedEmail,
      passwordHash,
    });

    const savedUser = await this.userRepository.save(newUser);
    return { id: savedUser.id, email: savedUser.email };
  }

  async verifyCredentials(input: {
    email: string;
    password: string;
  }): Promise<{ id: string; email: string } | null> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const foundUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!foundUser) {
      return null;
    }
    if (!(await argon2.verify(foundUser.passwordHash, input.password))) {
      return null;
    }
    return { id: foundUser.id, email: foundUser.email };
  }
}
