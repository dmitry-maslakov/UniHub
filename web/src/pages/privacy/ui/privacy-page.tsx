import { Anchor, List, Stack, Text } from '@mantine/core';
import { PageTitle } from '@/shared/ui';
import { CONTACT, UPDATED } from '../model/policy';
import { Section } from './section';

export function PrivacyPage() {
  const mail = <Anchor href={`mailto:${CONTACT}`}>{CONTACT}</Anchor>;
  return (
    <>
      <PageTitle description={`Last updated ${UPDATED}`}>
        Privacy policy
      </PageTitle>
      <Stack gap="xl">
        <Section title="Who runs it">
          <Text>
            UniHub at unihub.rs is run by an individual student developer.
            Questions about your data go to {mail}.
          </Text>
        </Section>

        <Section title="What we store, and why">
          <Text>Your account, so you can sign in and use the hub:</Text>
          <List>
            <List.Item>your email and name;</List.Item>
            <List.Item>
              a password hash, or a link to your Google sign-in;
            </List.Item>
            <List.Item>
              your sessions, with the IP address and browser (user agent) each
              was made from;
            </List.Item>
            <List.Item>your API keys, stored hashed;</List.Item>
            <List.Item>
              consents and tokens for the AI apps you connect.
            </List.Item>
          </List>
          <Text>
            Portal tokens you link are encrypted at rest. They are write-only:
            you can replace or remove one, but nothing shows it back.
          </Text>
          <Text>
            Course content fetched from learning portals with your own token, or
            with the operator's: posts, files, the text extracted from them and
            the search index built on it. You see only your own view of it.
          </Text>
        </Section>

        <Section title="Google sign-in">
          <Text>
            Signing in with Google reads only your basic profile and email (the
            openid, email and profile scopes). Nothing else is requested from
            Google, and Google data is used for nothing but signing you in.
          </Text>
        </Section>

        <Section title="Sharing">
          <Text>
            We don't sell data, show ads, or use third-party analytics or
            trackers. Three kinds of processors are involved:
          </Text>
          <List>
            <List.Item>Resend delivers our emails;</List.Item>
            <List.Item>Cloudflare carries the traffic;</List.Item>
            <List.Item>
              the AI apps you choose to connect get read-only access to what you
              can read, and nothing more.
            </List.Item>
          </List>
        </Section>

        <Section title="Keeping and deleting your data">
          <Text>
            When your account is deleted, your sessions, API keys, linked portal
            accounts and tokens, and your connected apps' consents and tokens
            are deleted with it, and so is what your linked portal accounts
            brought in that no other account can see. Course content that other
            accounts can also see stays while they do. To have your account
            deleted, write to {mail}.
          </Text>
        </Section>

        <Section title="Security">
          <Text>
            The hub is served over HTTPS only. Portal tokens are encrypted, and
            API keys are stored hashed.
          </Text>
        </Section>

        <Section title="Changes">
          <Text>
            If this policy changes, this page changes, and the date at the top
            with it.
          </Text>
        </Section>
      </Stack>
    </>
  );
}
