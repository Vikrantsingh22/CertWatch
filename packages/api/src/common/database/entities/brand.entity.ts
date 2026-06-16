import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('brands')
export class BrandEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  brandName: string;

  @Column({ type: 'text', array: true, default: () => 'ARRAY[]::text[]' })
  aliases: string[];

  @Column({ type: 'text', array: true, default: () => 'ARRAY[]::text[]' })
  legitDomains: string[];
}
