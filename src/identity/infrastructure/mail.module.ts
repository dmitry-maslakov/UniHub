import { Module } from '@nestjs/common';
import { Mailer } from '../domain/mailer.js';
import { NodemailerMailer } from './nodemailer.mailer.js';

@Module({
  providers: [{ provide: Mailer, useClass: NodemailerMailer }],
  exports: [Mailer],
})
export class MailModule {}
