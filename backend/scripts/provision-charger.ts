import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChargerService } from '../src/ocpp/charger.service';
import { Charger } from '../src/ocpp/charger.entity';

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
    TypeOrmModule.forFeature([Charger]),
  ],
  providers: [ChargerService],
})
class SeedModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(SeedModule);

  try {
    const chargers = app.get(ChargerService);
    const SEED_IDENTITY = process.argv[2] as string;
    const SEED_PASSWORD = process.argv[3] as string;

    if (!SEED_IDENTITY || !SEED_PASSWORD) {
      throw new Error('Usage: provision-charger <connectionId> <password>');
    }
    const result = await chargers.provision({
      connectionId: SEED_IDENTITY,
      password: SEED_PASSWORD,
    });
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('Charger Provision failed');
  process.exitCode = 1;
});
