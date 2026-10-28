import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('chargers')
export class Charger {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'connection_id', type: 'varchar', unique: true })
  connectionId!: string;

  @Column({ name: 'charge_point_model', type: 'varchar', length: 20 })
  chargePointModel!: string;

  @Column({ name: 'charge_point_vendor', type: 'varchar', length: 20 })
  chargePointVendor!: string;

  @Column({
    name: 'charge_point_serial_number',
    type: 'varchar',
    length: 25,
    nullable: true,
  })
  chargePointSerialNumber!: string | null;

  @Column({
    name: 'charge_box_serial_number',
    type: 'varchar',
    length: 25,
    nullable: true,
  })
  chargeBoxSerialNumber!: string | null;

  @Column({
    name: 'firmware_version',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  firmwareVersion!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  iccid!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  imsi!: string | null;

  @Column({
    name: 'meter_serial_number',
    type: 'varchar',
    length: 25,
    nullable: true,
  })
  meterSerialNumber!: string | null;

  @Column({ name: 'meter_type', type: 'varchar', length: 25, nullable: true })
  meterType!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'retired_at', type: 'timestamptz', nullable: true })
  retiredAt!: Date | null;
}
