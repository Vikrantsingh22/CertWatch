import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainsModule } from './modules/domains/domains.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { BrandsModule } from './modules/brands/brands.module';
import { LiveModule } from './modules/live/live.module';
import { MetricsController } from './metrics/metrics.controller';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'certwatch',
      password: 'certwatch',
      database: 'certwatch',
      synchronize: true,
      logging: true,
    }),
    DomainsModule,
    CampaignsModule,
    BrandsModule,
    LiveModule,
  ],
  controllers: [MetricsController],
})
export class AppModule {}
