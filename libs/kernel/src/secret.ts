import { inspect } from 'node:util';

const SHOWN = '[secret]';

// A credential, or anything else that must never show: it prints, logs,
// inspects and serializes as [secret], and only reveal() gives it, where it
// is put to use (a request's header). Shared by the hub and the sdk, so a
// connector gets one and keeps it one.
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal() {
    return this.#value;
  }

  toString() {
    return SHOWN;
  }

  toJSON() {
    return SHOWN;
  }

  [inspect.custom]() {
    return SHOWN;
  }
}
