import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { identityConfig } from '../identity.config.js';
import { Mailer, type Mail } from '../domain/mailer.js';

// SMTP when SMTP_URL is set; otherwise mails are only logged, for local runs
@Injectable()
export class NodemailerMailer extends Mailer {
  private readonly logger = new Logger('Mail');
  private readonly transport: Transporter;
  private readonly from: string;
  private readonly smtp: boolean;

  constructor(
    @Inject(identityConfig.KEY) { mail }: ConfigType<typeof identityConfig>,
  ) {
    super();
    this.smtp = mail.smtpUrl !== null;
    this.transport = createTransport(mail.smtpUrl ?? { jsonTransport: true });
    this.from = mail.from;
  }

  async send({ to, subject, text }: Mail) {
    await this.transport.sendMail({ from: this.from, to, subject, text });
    if (!this.smtp) this.logger.log(`to ${to}: ${subject}\n${text}`);
  }
}
