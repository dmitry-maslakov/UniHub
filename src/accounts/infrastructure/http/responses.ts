import { ApiProperty } from '@nestjs/swagger';
import type { LinkMode, PortalId } from '@app/kernel';
import type { AccountStatus } from '../../domain/portal-account.js';
import type { PortalView } from '../../application/portal-accounts.js';

// What the routes answer with, described for OpenAPI: never a token, nor
// any hint of one.

export class PortalResponse implements PortalView {
  @ApiProperty({ type: String, example: 'canvas' }) portal!: PortalId;
  @ApiProperty({
    enum: ['shared', 'token'],
    description:
      'how its accounts are linked: shared, the one the hub reads with; token, your own',
  })
  mode!: LinkMode;
  @ApiProperty({ description: 'you have an account of it linked' })
  linked!: boolean;
  @ApiProperty({
    enum: ['linked', 'expired', 'revoked'],
    nullable: true,
    description: 'null when not linked',
  })
  status!: AccountStatus | null;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'when the token stops working, if the portal says',
  })
  expiresAt!: Date | null;
}
