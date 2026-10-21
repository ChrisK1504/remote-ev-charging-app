import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({
    name: 'email',
    unique: true,
    type: 'text',
  })
  email!: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;

  @Column({
    name: 'id_tag',
    type: 'varchar',
    unique: true,
    nullable: false,
    length: 20,
  })
  idTag!: string;

  @Column({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt!: Date;
}
