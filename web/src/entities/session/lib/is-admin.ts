// Better Auth keeps a user's roles comma separated: whether admin is among
// them. Only for what the app shows; the hub's server decides what an admin
// may do.
export const isAdmin = (user: { role?: string | null }) =>
  (user.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .includes('admin');
