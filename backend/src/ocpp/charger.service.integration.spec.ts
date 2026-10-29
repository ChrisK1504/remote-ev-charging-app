import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Charger } from './charger.entity';
import { ChargerService } from './charger.service';

const describeDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

describeDatabase('ChargerService PostgreSQL persistence', () => {
  let database: DataSource;
  let runner: QueryRunner;
  let repository: Repository<Charger>;
  let service: ChargerService;

  const metadata = {
    chargePointModel: 'Model A',
    chargePointVendor: 'Vendor A',
    firmwareVersion: '1',
    chargePointSerialNumber: 'CP-A',
    chargeBoxSerialNumber: 'CB-A',
    iccid: 'SIM-A',
    imsi: 'IMSI-A',
    meterType: 'Meter A',
    meterSerialNumber: 'M-A',
  };

  beforeAll(async () => {
    database = new DataSource({
      type: 'postgres',
      url: process.env.TEST_DATABASE_URL,
      entities: [Charger],
      synchronize: false,
      extra: { connectionTimeoutMillis: 3000 },
    });
    await database.initialize();
  });

  beforeEach(async () => {
    runner = database.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const migration = readFileSync(
      resolve(__dirname, '../../migrations/007_create_chargers.sql'),
      'utf8',
    );
    await runner.query(
      migration.replace('CREATE TABLE chargers', 'CREATE TEMP TABLE chargers'),
    );
    repository = runner.manager.getRepository(Charger);
    service = new ChargerService(repository);
  });

  afterEach(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('updates every reported field while preserving one row and its identity', async () => {
    await service.registerOrUpdate('CP_TEST', metadata);
    const original = await repository.findOneByOrFail({
      connectionId: 'CP_TEST',
    });
    const updated = Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [key, `${value}2`]),
    ) as typeof metadata;

    await service.registerOrUpdate('CP_TEST', updated);

    expect(await repository.count()).toBe(1);
    expect(
      await repository.findOneByOrFail({ connectionId: 'CP_TEST' }),
    ).toMatchObject({
      ...updated,
      id: original.id,
      connectionId: original.connectionId,
      createdAt: original.createdAt,
      retiredAt: null,
    });
  });

  it('retains optional metadata omitted from a later boot', async () => {
    await service.registerOrUpdate('CP_TEST', metadata);
    await service.registerOrUpdate('CP_TEST', {
      chargePointModel: 'Model B',
      chargePointVendor: 'Vendor B',
    });

    expect(
      await repository.findOneByOrFail({ connectionId: 'CP_TEST' }),
    ).toMatchObject({
      ...metadata,
      chargePointModel: 'Model B',
      chargePointVendor: 'Vendor B',
    });
  });
});
