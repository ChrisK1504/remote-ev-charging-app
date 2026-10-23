import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../src/users/user.module';
import { UserService } from '../src/users/user.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    UserModule,
  ],
})
class SeedModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(SeedModule);

  try {
    const users = app.get(UserService);
    const SEED_EMAIL = process.argv[2] as string;
    const SEED_PASSWORD = process.argv[3] as string;

    if (!SEED_EMAIL || !SEED_PASSWORD) {
      throw new Error('Usage: seed-user <email> <password>');
    }
    const result = await users.create({
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
    });
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('User seed failed');
  process.exitCode = 1;
});
