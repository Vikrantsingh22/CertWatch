import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('campaign_domains')
export class CampaignDomainEntity {
  @PrimaryColumn('uuid')
  campaignId: string;

  @PrimaryColumn('uuid')
  domainId: string;

  @Column({ type: 'jsonb', nullable: true })
  sharedSignals: any;
}
