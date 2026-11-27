import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { pmwikiConfig } from './pmwiki.config.js';
import { PmwikiConnector } from './pmwiki.connector.js';

@Module({
  imports: [ConfigModule.forFeature(pmwikiConfig)],
  providers: [PmwikiConnector],
})
export class PmwikiModule {}
