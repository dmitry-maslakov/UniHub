import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';

// A ThrottlerGuard for one of the named limits in AppModule. A plain one runs
// every named limit, so each route picks its own.
export const throttleBy = (name: string): typeof ThrottlerGuard => {
  @Injectable()
  class Only extends ThrottlerGuard {
    protected handleRequest(request: ThrottlerRequest) {
      return request.throttler.name === name
        ? super.handleRequest(request)
        : Promise.resolve(true);
    }
  }
  return Only;
};
