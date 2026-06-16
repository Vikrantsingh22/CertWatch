import { Controller, Get, Param, Query } from '@nestjs/common';
import { DomainsService } from './domains.service';

@Controller('domains')
export class DomainsController {
  constructor(private domainsService: DomainsService) {}

  @Get()
  findAll(@Query('risk') risk?: string, @Query('limit') limit?: number) {
    return this.domainsService.findAll(risk, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.domainsService.findOne(id);
  }
}
