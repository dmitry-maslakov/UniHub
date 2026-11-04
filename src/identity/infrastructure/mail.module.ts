import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Mailer } from '../domain/mailer.js';
import { mailConfig } from '../mail.config.js';
import { NodemailerMailer } from './nodemailer.mailer.js';

@Module({
  imports: [ConfigModule.forFeature(mailConfig)],
  providers: [{ provide: Mailer, useClass: NodemailerMailer }],
  exports: [Mailer],
})
export class MailModule {}
