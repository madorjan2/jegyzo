// Email notifications via MailHog (FR-707, FR-708, FR-905, FR-1004).
// Every outgoing mail is recorded in EmailNotification (append log).
// The mail language comes from the recipient's User.locale, not the request.
import { Injectable, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Locale } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';

const SUBJECTS = {
  hu: { JEGY_KIIALLITVA: 'A jegyeid megérkeztek', VISSZATERITES_TELJESITVE: 'Visszatérítés feldolgozva', ESEMENY_LEMONDVA: 'Az eseményt lemondták' },
  en: { JEGY_KIIALLITVA: 'Your tickets are ready', VISSZATERITES_TELJESITVE: 'Refund processed', ESEMENY_LEMONDVA: 'The event has been cancelled' },
} as const;

@Injectable()
export class EmailService implements OnModuleInit {
  private transporter!: nodemailer.Transporter;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const host = process.env.SMTP_HOST ?? 'mailhog';
    const port = Number(process.env.SMTP_PORT ?? 1025);
    this.transporter = nodemailer.createTransport({
      host, port, secure: process.env.SMTP_SECURE === 'true',
      // MailHog accepts anything; no auth
    });
  }

  /**
   * Sends a templated mail to a user and records the delivery.
   * The payment pipeline never fails because of a mail failure (E8-S7).
   */
  async sendTicketMail(toEmail: string, eventTitle: string, ticketCodes: string[], downloadUrlPath: string) {
    const user = await this.prisma.user.findUnique({ where: { email: toEmail } });
    const locale: Locale = (user?.locale as Locale) ?? 'hu';
    const lang = locale === 'en' ? 'en' : 'hu';

    let status: 'ELKULDVE' | 'HIBA' = 'ELKULDVE';
    let errorMessage: string | undefined;
    let sentAt: Date | null = null;
    try {
      await this.transporter.sendMail({
        from: `"${process.env.MAIL_FROM_NAME ?? 'Jegyzo'}" <${process.env.MAIL_FROM_ADDRESS ?? 'noreply@jegyzo.local'}>`,
        to: toEmail,
        subject: SUBJECTS[lang].JEGY_KIIALLITVA,
        html: `<p>${lang === 'en' ? 'Thank you for your purchase!' : 'Köszönjük a vásárlást!'}</p>
               <p><strong>${eventTitle}</strong></p>
               <ul>${ticketCodes.map((c) => `<li>${c}</li>`).join('')}</ul>
               <p><a href="${downloadUrlPath}">${lang === 'en' ? 'Download your tickets' : 'Jegyeid letöltése'}</a></p>`,
      });
      sentAt = new Date();
    } catch (err) {
      status = 'HIBA';
      errorMessage = String(err);
    }

    const record = await this.prisma.emailNotification.create({
      data: {
        toEmail, template: 'JEGY_KIIALLITVA', locale,
        status, sentAt, errorMessage,
        userId: user?.id ?? 1,
      },
    });
    return { id: record.id, status };
  }

  /** E8-S8: resend of an existing paid booking's ticket mail. */
  async resendTicketMail(bookingId: number, toEmail: string) {
    const tickets = await this.prisma.ticket.findMany({ where: { bookingId } });
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { event: true } });
    if (!booking) return undefined;
    const result = await this.sendTicketMail(toEmail, booking.event.name, tickets.map((t) => t.code), `/tickets/${tickets[0]?.code ?? ''}/pdf`);
    return result;
  }

  /** Distinct buyer emails across a cancelled event's bookings (FR-905). */
  async prismaDistinctEmails(eventId: number): Promise<string[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { eventId },
      distinct: ['userId'],
      select: { user: { select: { email: true } } },
    });
    return [...new Set(bookings.map((b) => b.user.email))];
  }

  /**
   * Generic FR-905 mail; template=ESEMENY_LEMONDVA | VISSZATERITES_TELJESITVE.
   * Language comes from the recipient's User.locale (FR-1004). Delivery
   * failures never throw — they become a HIBA EmailNotification record.
   */
  async sendTemplatedMail(
    toEmail: string,
    template: 'ESEMENY_LEMONDVA' | 'VISSZATERITES_TELJESITVE',
    vars: { eventName?: string; amount?: number },
  ) {
    const user = await this.prisma.user.findUnique({ where: { email: toEmail } });
    const locale: Locale = (user?.locale as Locale) ?? 'hu';
    const lang = locale === 'en' ? 'en' : 'hu';
    const hu: Record<string, string> = {
      ESEMENY_LEMONDVA: 'Az eseményt lemondták',
      VISSZATERITES_TELJESITVE: 'Visszatérítés feldolgozva',
    };
    const en: Record<string, string> = {
      ESEMENY_LEMONDVA: 'The event has been cancelled',
      VISSZATERITES_TELJESITVE: 'Refund processed',
    };
    const bodyHu: Record<string, string> = {
      ESEMENY_LEMONDVA: `<p>A(z) <strong>${vars.eventName ?? ''}</strong> eseményt lemondták.</p>
        <p>A jegyeid érvénytelenné váltak.</p>`,
      VISSZATERITES_TELJESITVE: `<p>A(z) <strong>${vars.eventName ?? ''}</strong> esemény lemondása miatt<br/>`
        + `${(vars.amount ?? 0).toLocaleString('hu-HU')} Ft visszatérítés elküldésre került a kártyádra.</p>`,
    };
    const bodyEn: Record<string, string> = {
      ESEMENY_LEMONDVA: `<p>The event <strong>${vars.eventName ?? ''}</strong> has been cancelled.</p>
        <p>Your tickets are no longer valid.</p>`,
      VISSZATERITES_TELJESITVE: `<p>Because the event <strong>${vars.eventName ?? ''}</strong> was cancelled, a refund of<br/>`
        + `${(vars.amount ?? 0).toLocaleString('en-US')} HUF is on its way back to your card.</p>`,
    };

    let status: 'ELKULDVE' | 'HIBA' = 'ELKULDVE';
    let errorMessage: string | undefined;
    let sentAt: Date | null = null;
    try {
      await this.transporter.sendMail({
        from: `"${process.env.MAIL_FROM_NAME ?? 'Jegyzo'}" <${process.env.MAIL_FROM_ADDRESS ?? 'noreply@jegyzo.local'}>`,
        to: toEmail,
        subject: (lang === 'en' ? en : hu)[template] ?? template,
        html: lang === 'en' ? bodyEn[template] : bodyHu[template],
      });
      sentAt = new Date();
    } catch (err) {
      status = 'HIBA';
      errorMessage = String(err);
    }

    const record = await this.prisma.emailNotification.create({
      data: {
        toEmail, template: template as never, locale,
        status, sentAt, errorMessage,
        userId: user?.id ?? 1,
      },
    });
    return { id: record.id, status };
  }
}
