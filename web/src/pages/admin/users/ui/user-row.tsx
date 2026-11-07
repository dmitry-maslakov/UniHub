import { Badge } from '@mantine/core';
import { isAdmin, useSession } from '@/entities/session';
import { useFormat } from '@/shared/i18n';
import { Row, RowAction, RowText } from '@/shared/ui';
import { useTranslation } from 'react-i18next';
import { UserActions } from './user-actions';

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date | string;
  role?: string | null;
  banned?: boolean | null;
  banExpires?: Date | string | null;
}

// A user: their name and state, and what an admin may do to them, none
// to themselves
export function UserRow({ user }: { user: User }) {
  const { t } = useTranslation('admin');
  const { date } = useFormat();
  const self = useSession().user.id === user.id;
  return (
    <Row>
      <RowText
        title={user.name}
        badges={
          <>
            {isAdmin(user) && (
              <Badge variant="light">{t('users.badge.admin')}</Badge>
            )}
            {user.banned && (
              <Badge color="red" variant="light">
                {t('users.badge.banned')}
              </Badge>
            )}
            {self && (
              <Badge variant="outline" color="gray">
                {t('users.badge.you')}
              </Badge>
            )}
          </>
        }
        meta={[
          user.email,
          !user.emailVerified && t('users.unconfirmed'),
          user.banned &&
            user.banExpires &&
            t('users.bannedUntil', { date: date(user.banExpires) }),
          t('users.joined', { date: date(user.createdAt) }),
        ]}
      />
      {!self && (
        <RowAction>
          <UserActions user={user} />
        </RowAction>
      )}
    </Row>
  );
}
