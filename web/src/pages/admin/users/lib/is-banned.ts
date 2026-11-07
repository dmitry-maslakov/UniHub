interface Bannable {
  banned?: boolean | null;
  banExpires?: Date | string | null;
}

// Better Auth clears a ban that ran out only when the user signs in next, so
// the flag alone says banned for a while after
export const isBanned = ({ banned, banExpires }: Bannable, now = new Date()) =>
  !!banned && (!banExpires || new Date(banExpires) > now);
