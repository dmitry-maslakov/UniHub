import { Button, Group, Stack, TextInput } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { ApiError, fetchClient } from '@/shared/api';
import { invalidateHubCourses } from '../api/hub-courses';
import { suggestSlug } from '../lib/suggest-slug';
import { createCourseSchema } from '../model/schema';

// Names a course and gives it its address, suggested from the name until
// the address is edited
export function CreateCourseForm() {
  const { t } = useTranslation('admin');
  const schema = useMemo(() => createCourseSchema(t), [t]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const form = useForm<z.input<typeof schema>>({
    mode: 'uncontrolled',
    // the address is the user's once they go into it, not once it is set
    touchTrigger: 'focus',
    initialValues: { name: '', slug: '' },
    validate: schemaResolver(schema, { sync: true }),
  });
  const create = useMutation({
    mutationFn: async ({ name, slug }: z.output<typeof schema>) => {
      const { data } = await fetchClient.POST('/api/courses', {
        body: { slug, name },
      });
      return data;
    },
    onSuccess: async (data) => {
      await invalidateHubCourses(queryClient);
      if (data)
        await navigate({
          to: '/admin/courses/$courseId',
          params: { courseId: data.id },
        });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        form.setFieldError('slug', t('courses.new.slug.taken'));
      else notifications.show({ color: 'red', message: t('course.failed') });
    },
  });
  const name = form.getInputProps('name');

  return (
    <form
      noValidate
      onSubmit={form.onSubmit((values) => create.mutate(schema.parse(values)))}
    >
      <Stack gap="md">
        <TextInput
          label={t('courses.new.name.label')}
          autoComplete="off"
          key={form.key('name')}
          {...name}
          onChange={(event) => {
            name.onChange(event);
            if (!form.isTouched('slug'))
              form.setFieldValue(
                'slug',
                suggestSlug(event.currentTarget.value),
              );
          }}
        />
        <TextInput
          label={t('courses.new.slug.label')}
          description={t('courses.new.slug.help')}
          leftSection="/courses/"
          leftSectionWidth={84}
          autoComplete="off"
          spellCheck={false}
          styles={{
            input: { fontFamily: 'var(--mantine-font-family-monospace)' },
          }}
          key={form.key('slug')}
          {...form.getInputProps('slug')}
        />
        <Group>
          <Button type="submit" loading={create.isPending}>
            {t('courses.new.action')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
