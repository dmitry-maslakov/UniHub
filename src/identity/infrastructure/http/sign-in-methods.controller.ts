import { Controller, Get, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { identityConfig } from '../../identity.config.js';

export class SignInMethodsResponse {
  @ApiProperty({ description: 'Google sign-in is set up' })
  google!: boolean;
}

// How one may sign in besides email and password, for the sign-in page:
// Better Auth has no route that says which social providers are on.
@ApiTags('auth')
@Controller('sign-in-methods')
@AllowAnonymous()
export class SignInMethodsController {
  constructor(
    @Inject(identityConfig.KEY)
    private readonly config: ConfigType<typeof identityConfig>,
  ) {}

  @Get()
  @ApiOkResponse({ type: SignInMethodsResponse })
  methods(): SignInMethodsResponse {
    return { google: this.config.google !== undefined };
  }
}
