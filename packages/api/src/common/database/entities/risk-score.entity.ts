import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('risk_scores')
export class RiskScoreEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  domainId: string;

  @Column()
  score: number;

  @Column({
    type: 'enum',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  })
  riskLevel: string;

  @Column({ type: 'jsonb', nullable: true })
  reasons: string[];

  @Column({ type: 'timestamp' })
  computedAt: Date;
}
