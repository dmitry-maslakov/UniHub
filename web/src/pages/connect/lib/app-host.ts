// An app by the host of its client_id URL (as the consent page shows it),
// else by the id as it is
export const appHost = (clientId: string) => {
  try {
    return new URL(clientId).host || clientId;
  } catch {
    return clientId;
  }
};
