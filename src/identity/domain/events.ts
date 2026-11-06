// What identity tells the other modules, on the EventBus: a user is gone,
// deleted by an admin, so what they keep of the user goes too. Sent once
// Better Auth has committed the delete.
export class UserDeletedEvent {
  constructor(readonly userId: string) {}
}
