import type { Schemas } from '@/shared/api';

// How the user reads a part of a course, in their words
export const viaText = (via: Schemas['PortalCourseResponse']['via']) =>
  ({
    account: 'through your account',
    pick: 'picked by you',
    link: 'added by an admin',
  })[via];
