import { ApiProperty } from '@nestjs/swagger';
import type { Instance, LinkMode, PortalId } from '@app/kernel';
import type { AccountStatus } from '../../domain/portal-account.js';
import type { PortalView } from '../../application/portal-accounts.js';
import type {
  CatalogCourseView,
  CatalogView,
} from '../../application/portal-picks.js';

// What the routes answer with, described for OpenAPI: never a token, nor
// any hint of one.

export class PortalResponse implements PortalView {
  @ApiProperty({ type: String, example: 'canvas' }) portal!: PortalId;
  @ApiProperty({
    example: 'Canvas',
    description: 'the name it is shown by, its id unless the hub names it',
  })
  label!: string;
  @ApiProperty({
    enum: ['shared', 'token', 'public'],
    description:
      'how it is read: shared, by the one account the hub reads with; token, by your own; public, the courses you pick of its catalog',
  })
  mode!: LinkMode;
  @ApiProperty({
    description: 'you have an account of it linked; never of a public one',
  })
  linked!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://canvas.example.edu',
    description:
      "the address of the school's site your account is of, on a portal that is a site per school; null when not linked, or for a portal of one site",
  })
  instance!: Instance | null;
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
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "how many courses of a public portal's catalog you picked; null for any other portal",
  })
  picked!: number | null;
  @ApiProperty({
    description:
      'your own account of it was just linked and is being read for the first time: true until what that first read finds shows; false when not linked, expired or revoked. No counts or times, which could tell how long a read took',
  })
  firstSync!: boolean;
}

export class CatalogCourseResponse implements CatalogCourseView {
  @ApiProperty({ description: "the course's id on its portal" })
  externalId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'the course on its portal',
  })
  url!: string | null;
  @ApiProperty({ description: 'you picked it: you read it here' })
  picked!: boolean;
  @ApiProperty({ description: 'the hub first saw it within 14 days' })
  isNew!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "the slug of your course you show it with, one you read through your own account; null when it's a course of its own, in a course an admin linked it to, or not picked",
  })
  into!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'the slug of a course of yours to show it with: the one you read through your own account that shares the most files with it, at least 2, of those you see; null when none does, an admin linked it to a course, or not picked',
  })
  suggestedInto!: string | null;
}

export class CatalogResponse implements CatalogView {
  @ApiProperty({ description: 'how many courses match, on every page' })
  total!: number;
  @ApiProperty({ type: [CatalogCourseResponse], description: 'by name' })
  courses!: CatalogCourseResponse[];
}
