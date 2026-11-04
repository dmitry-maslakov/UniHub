import type { QueryBus } from '@nestjs/cqrs';

type QueryClass = abstract new (...args: never[]) => object;

// A query bus for the application's unit tests: each kind of query answered
// by a function of it (null for the rest), the queries kept in the order
// they were asked.
export class FakeQueries {
  readonly asked: object[] = [];

  constructor(
    private readonly answers: [QueryClass, (query: any) => unknown][],
  ) {}

  get bus() {
    return this as unknown as QueryBus;
  }

  async execute(query: object) {
    this.asked.push(query);
    const answer = this.answers.find(([kind]) => query instanceof kind);
    return answer ? answer[1](query) : null;
  }
}
