import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { websiteConfig } from './website.config.js';
import { WebsiteConnector } from './website.connector.js';

@Module({
  imports: [ConfigModule.forFeature(websiteConfig)],
  providers: [WebsiteConnector],
})
export class WebsiteModule {}
