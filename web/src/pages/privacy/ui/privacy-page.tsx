import { Anchor, List, Stack, Text } from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';
import { useFormat } from '@/shared/i18n';
import { PageTitle, Section } from '@/shared/ui';
import { CONTACT, SITE, UPDATED } from '../model/policy';

export function PrivacyPage() {
  const { t } = useTranslation('privacy');
  const { date } = useFormat();
  // the contact's address, a link to write to; a paragraph that holds it
  const mail = { mail: <Anchor href={`mailto:${CONTACT}`} /> };
  return (
    <>
      <PageTitle
        description={t('updated', { date: date(`${UPDATED}T12:00:00`) })}
      >
        {t('title')}
      </PageTitle>
      <Stack gap="xl">
        <Section title={t('who.title')}>
          <Text>
            <Trans
              t={t}
              i18nKey="who.body"
              values={{ site: SITE, contact: CONTACT }}
              components={mail}
            />
          </Text>
        </Section>

        <Section title={t('stored.title')}>
          <Text>{t('stored.intro')}</Text>
          <List>
            <List.Item>{t('stored.items.email')}</List.Item>
            <List.Item>{t('stored.items.password')}</List.Item>
            <List.Item>{t('stored.items.sessions')}</List.Item>
            <List.Item>{t('stored.items.keys')}</List.Item>
            <List.Item>{t('stored.items.consents')}</List.Item>
          </List>
          <Text>{t('stored.tokens')}</Text>
          <Text>{t('stored.content')}</Text>
        </Section>

        <Section title={t('google.title')}>
          <Text>{t('google.body')}</Text>
        </Section>

        <Section title={t('sharing.title')}>
          <Text>{t('sharing.intro')}</Text>
          <List>
            <List.Item>{t('sharing.items.mail')}</List.Item>
            <List.Item>{t('sharing.items.traffic')}</List.Item>
            <List.Item>{t('sharing.items.apps')}</List.Item>
          </List>
        </Section>

        <Section title={t('keeping.title')}>
          <Text>
            <Trans
              t={t}
              i18nKey="keeping.body"
              values={{ contact: CONTACT }}
              components={mail}
            />
          </Text>
        </Section>

        <Section title={t('security.title')}>
          <Text>{t('security.body')}</Text>
        </Section>

        <Section title={t('changes.title')}>
          <Text>{t('changes.body')}</Text>
        </Section>
      </Stack>
    </>
  );
}
