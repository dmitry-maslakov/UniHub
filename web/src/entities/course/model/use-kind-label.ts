import { useTranslation } from 'react-i18next';
import { kindLabel } from '../lib/kind-label';

// kind -> its name in the current language
export function useKindLabel() {
  const { t } = useTranslation('common');
  return (kind: string) => kindLabel(t, kind);
}
