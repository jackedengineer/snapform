import { FormApi } from '@tanstack/react-form';
import { expect, it } from 'vitest';
import { newBlankDefinition } from './new-form';
import { recoverDraft } from './recover-draft';
it('keeps the recovered copy through React option synchronization and restores the local alternative', () => {
  const original = newBlankDefinition();
  const { rules, ...initialValues } = original;
  const form = new FormApi({ defaultValues: initialValues });
  const unmount = form.mount();
  try {
    form.setFieldValue('title', 'My local alternative');
    const local = { ...form.state.values, rules };
    const saved = { ...original, title: 'Newer saved copy' };
    recoverDraft(form, saved);
    form.update({ defaultValues: initialValues });
    expect(form.state.values.title).toBe('Newer saved copy');
    recoverDraft(form, local);
    form.update({ defaultValues: initialValues });
    expect(form.state.values.title).toBe('My local alternative');
  } finally {
    unmount();
  }
});
