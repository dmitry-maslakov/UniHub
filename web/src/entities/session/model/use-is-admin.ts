import { isAdmin } from '../lib/is-admin';
import { useSession } from './use-session';

// whether the signed-in user is an admin, under SessionGate
export const useIsAdmin = () => isAdmin(useSession().user);
