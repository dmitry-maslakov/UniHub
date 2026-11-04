import type { CommandBus, QueryBus } from '@nestjs/cqrs';

type MessageClass = abstract new (...args: never[]) => object;

// A command or query bus for the unit specs: each kind of command or query
// answered by a function of it (null for the rest; Object answers them all),
// everything kept in the order it was sent.
export class FakeBus {
  readonly sent: object[] = [];

  constructor(
    private readonly answers: [MessageClass, (message: any) => unknown][] = [],
  ) {}

  get queries() {
    return this as unknown as QueryBus;
  }

  get commands() {
    return this as unknown as CommandBus;
  }

  async execute(message: object) {
    this.sent.push(message);
    const answer = this.answers.find(([kind]) => message instanceof kind);
    return answer ? answer[1](message) : null;
  }
}
