import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

// A route parameter that names a schema (@Query({ schema }), @Param(name,
// { schema })) is checked and shaped by it on every HTTP route: a bad one is a
// 400, never a call. HTTP only; MCP and gRPC check their own input.
@Module({
  providers: [{ provide: APP_PIPE, useClass: StandardSchemaValidationPipe }],
})
export class ValidationModule {}
