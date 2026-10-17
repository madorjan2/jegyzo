import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { JwtService } from './jwt.service';

// Refresh tokens are stored encoded; a DB leak alone does not reveal plaintext
// credentials, and revocation is tracked per row (revokedAt).
@Injectable()
export class RefreshTokenService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private ready?: Promise<void>;

  // db:reset drops all tables; the refresh-token table is recreated on first
  // use instead of only at module init, and a failed ensure clears the memo so
  // the next call retries (a reset can happen between two requests).
  private ensure(): Promise<void> {
    this.ready ??= (async () => {
      try {
        await this.prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS "RefreshToken" (
            "id"   SERIAL PRIMARY KEY,
            "userId"  INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
            "tokenHash" TEXT NOT NULL UNIQUE,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
            "revokedAt"   TIMESTAMP(3)
          )`;
      } catch (err) {
        this.ready = undefined;
        throw err;
      }
    })();
    return this.ready;
  }

  async onModuleInit() {
    await this.ensure();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  private hash(token: string): string {
    return Buffer.from(token).toString('base64url');
  }

  // Runs an operation against the RefreshToken table. After `db:reset` drops
  // everything, the first statement fails with 42P01 (relation not found);
  // drop the memoized ready-promise, recreate the table, and retry once.
  private async withTable<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      const missingTable = code === 'P2010' || String(err).includes('does not exist');
      if (!missingTable) throw err;
      this.ready = undefined;
      await this.ensure();
      return await op();
    }
  }

  async issue(userId: number, role: string): Promise<string> {
    await this.ensure();
    const token = this.jwt.signRefresh(userId, role);
    await this.withTable(() =>
      this.prisma.$executeRaw`
        INSERT INTO "RefreshToken" ("userId", "tokenHash") VALUES (${userId}, ${this.hash(token)})`);
    return token;
  }

  async verify(token: string): Promise<boolean> {
    await this.ensure();
    const rows = await this.withTable(() =>
      this.prisma.$queryRaw<{ revokedAt: Date | null }[]>`
        SELECT "revokedAt" FROM "RefreshToken" WHERE "tokenHash" = ${this.hash(token)}`);
    return rows.length > 0 && rows[0].revokedAt === null;
  }


  async revoke(token: string): Promise<void> {
    await this.ensure();
    await this.withTable(() =>
      this.prisma.$executeRaw`
        UPDATE "RefreshToken" SET "revokedAt" = now() WHERE "tokenHash" = ${this.hash(token)} AND "revokedAt" IS NULL`);
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.ensure();
    await this.withTable(() =>
      this.prisma.$executeRaw`
        UPDATE "RefreshToken" SET "revokedAt" = now() WHERE "userId" = ${userId} AND "revokedAt" IS NULL`);
  }
}
