import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Mailer } from '../domain/mailer.js';
import { identityConfig } from '../identity.config.js';
import { NodemailerMailer } from './nodemailer.mailer.js';

@Module({
  imports: [ConfigModule.forFeature(identityConfig)],
  providers: [{ provide: Mailer, useClass: NodemailerMailer }],
  exports: [Mailer],
})
export class MailModule {}
