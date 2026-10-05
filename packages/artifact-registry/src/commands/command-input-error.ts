/** Input a command cannot act on (a bad flag value, a missing config file, a selection that matches nothing). A command reports its message and exits non-zero. */
export class CommandInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandInputError';
  }
}
