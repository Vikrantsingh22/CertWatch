import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('enrichments')
export class EnrichmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  domainId: string;

  @Column({ type: 'jsonb', nullable: true })
  whoisJson: any;

  @Column({ type: 'jsonb', nullable: true })
  dnsJson: any;

  @Column({ type: 'jsonb', nullable: true })
  sslJson: any;

  @Column({ nullable: true })
  asn: string;

  @Column({ default: false })
  asnFlagged: boolean;

  @Column({ type: 'jsonb', nullable: true })
  redirectChain: string[];

  @Column({ nullable: true })
  screenshotPath: string;

  @Column({ default: false })
  hasLoginForm: boolean;
}
