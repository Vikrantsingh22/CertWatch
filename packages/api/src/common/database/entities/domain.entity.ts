import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('domains')
export class DomainEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fqdn: string;

  @Column({ type: 'timestamp' })
  firstSeenAt: Date;

  @Column()
  source: string;
}
