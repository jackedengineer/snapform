// Reads only the plan's uploads flag from the billing API, so the editor does
// not load the billing schemas. The API alone decides the plan.
export function uploadsAllowed(value: unknown) {
  const uploads = (value as { billing?: { features?: { uploads?: unknown } } })
    ?.billing?.features?.uploads;
  if (typeof uploads !== 'boolean') throw Error('Invalid billing response');
  return uploads;
}
