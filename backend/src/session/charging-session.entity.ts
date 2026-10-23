import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('charging_sessions')
export class ChargingSession {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({
    name: 'transaction_id',
    type: 'integer',
    unique: true,
    generated: 'identity',
    generatedIdentity: 'ALWAYS',
  })
  transactionId!: number;

  @Column({
    name: 'user_id',
    type: 'uuid',
    nullable: true,
  })
  userId!: string | null;

  @Column({ name: 'charge_point_id', type: 'text' })
  chargePointId!: string;

  @Column({ name: 'connector_id', type: 'integer' })
  connectorId!: number;

  @Column({ name: 'id_tag', type: 'varchar', length: 20 })
  idTag!: string;

  @Column({ name: 'status', type: 'text' })
  status!: 'Active' | 'Completed';

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'ended_at', nullable: true, type: 'timestamptz' })
  endedAt!: Date | null;

  @Column({ name: 'meter_start', type: 'integer' })
  meterStart!: number;

  @Column({ name: 'meter_stop', type: 'integer', nullable: true })
  meterStop!: number | null;

  @Column({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt!: Date;
}
