// The name a portal is shown by, as the hub labels it; its id for one the
// hub doesn't list to the user (a shared one's) or while the list loads
export const portalLabel = (
  portal: string,
  portals?: readonly { portal: string; label?: string | null }[],
) => portals?.find((p) => p.portal === portal)?.label || portal;
