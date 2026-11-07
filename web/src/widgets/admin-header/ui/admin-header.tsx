import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageTitle } from '@/shared/ui';
import classes from './admin-header.module.css';

// The admin pages' heading and the two places under it: users and courses
export function AdminHeader({ current }: { current: 'users' | 'courses' }) {
  const { t } = useTranslation('admin');
  return (
    <>
      <PageTitle description={t('description')}>{t('title')}</PageTitle>
      <nav aria-label={t('title')} className={classes.tabs}>
        <Link
          to="/admin/users"
          className={classes.tab}
          aria-current={current === 'users' ? 'page' : undefined}
        >
          {t('tabs.users')}
        </Link>
        <Link
          to="/admin/courses"
          className={classes.tab}
          aria-current={current === 'courses' ? 'page' : undefined}
        >
          {t('tabs.courses')}
        </Link>
      </nav>
    </>
  );
}
