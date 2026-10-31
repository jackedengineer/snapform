import { sql } from 'drizzle-orm';
import type { Transaction } from '../../src/client.ts';
import { compileDefinition } from '../../../contracts/src/compile.ts';
import { prepareIntakeProgress } from '../../../contracts/src/intake-progress.ts';
import { formFixture } from '../../../contracts/test/form-fixture.ts';

// Test-only simple-query batches keep remote setup round trips bounded. Every
// caller supplies its rollback transaction; these helpers never commit or use
// an owner login. Text is encoded as data, not interpolated as SQL syntax.
function text(value: string) {
  return `convert_from(decode('${Buffer.from(value).toString('base64')}','base64'),'UTF8')`;
}
function ownerScope(actor: string, workspaceId: string) {
  return `SELECT set_config('snapform.user_id','${actor}',true),
    set_config('snapform.workspace_id','${workspaceId}',true),set_config('snapform.role','owner',true),
    set_config('snapform.public_id','',true),set_config('snapform.intake_id','',true),set_config('snapform.intake_hash','',true);`;
}
export async function seedForm(tx: Transaction, name = 'Form QA') {
  const actor = crypto.randomUUID(),
    workspaceId = crypto.randomUUID(),
    formId = crypto.randomUUID();
  const { definition, ids: fieldIds } = formFixture();
  await tx.execute(
    sql.raw(`${ownerScope(actor, workspaceId)}
      INSERT INTO public."user"(id,name,email,email_verified)
        VALUES('${actor}',${text(name)},'${actor}@example.invalid',true);
      INSERT INTO public.workspace(id,name,segment,created_by)
        VALUES('${workspaceId}',${text(name)},'agency','${actor}');
      INSERT INTO public.membership(workspace_id,user_id,role)
        VALUES('${workspaceId}','${actor}','owner');
      INSERT INTO public.form(id,workspace_id,created_by)
        VALUES('${formId}','${workspaceId}','${actor}');
      INSERT INTO public.form_draft(workspace_id,form_id,revision,definition,updated_by)
        VALUES('${workspaceId}','${formId}',1,${text(JSON.stringify(definition))}::jsonb,'${actor}');`),
  );
  return { actor, workspaceId, formId, definition, fieldIds };
}

export async function seedResponses(tx: Transaction, name = 'Response QA') {
  const fixture = await seedForm(tx, name);
  const { actor, workspaceId, formId, definition, fieldIds } = fixture;
  const compiled = compileDefinition(definition);
  if (!compiled.ok) throw Error('Valid response fixture required');
  const version = crypto.randomUUID(),
    publicId = crypto.randomUUID(),
    ids = [crypto.randomUUID(), crypto.randomUUID()].sort().reverse(),
    partial = crypto.randomUUID();
  const answers = {
    [fieldIds.budget]: { state: 'value', value: 0 },
    [fieldIds.contact]: { state: 'value', value: 'qa@example.invalid' },
  };
  const prepared = prepareIntakeProgress(compiled.definition, answers, true);
  if (!prepared.ok) throw Error('Complete response fixture required');
  function intakeScope(id: string, hash: string) {
    return `SELECT set_config('snapform.user_id','',true),set_config('snapform.workspace_id','',true),set_config('snapform.role','',true),
      set_config('snapform.public_id','${publicId}',true),set_config('snapform.intake_id','${id}',true),set_config('snapform.intake_hash','${hash}',true);`;
  }
  await tx.execute(
    sql.raw(`
      INSERT INTO public.form_version(id,workspace_id,form_id,number,source_revision,definition,created_by)
        VALUES('${version}','${workspaceId}','${formId}',1,1,${text(JSON.stringify(compiled.definition))}::jsonb,'${actor}');
      INSERT INTO public.form_publication(workspace_id,form_id,public_id,version_id,active,updated_by)
        VALUES('${workspaceId}','${formId}','${publicId}','${version}',true,'${actor}');
      ${ids
        .map((id) => {
          const hash = id.replaceAll('-', '').repeat(2);
          return `${intakeScope(id, hash)}
            DO $seed$ DECLARE outcome text; BEGIN
              IF public.start_response_session('${publicId}','${id}','${hash}') IS DISTINCT FROM '${id}'::uuid
                THEN RAISE EXCEPTION 'FIXTURE_ADMISSION_FAILED'; END IF;
              SELECT result.outcome INTO outcome FROM public.mutate_response_session(
                '${id}','${crypto.randomUUID()}',1,'submit',${text(JSON.stringify(answers))}::jsonb,
                ${text(JSON.stringify(prepared.answers))}::jsonb,'${prepared.endingId}') result;
              IF outcome IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'FIXTURE_SUBMISSION_FAILED'; END IF;
            END $seed$;`;
        })
        .join('\n')}
      ${intakeScope(partial, 'e'.repeat(64))}
      DO $seed$ BEGIN
        IF public.start_response_session('${publicId}','${partial}','${'e'.repeat(64)}') IS DISTINCT FROM '${partial}'::uuid
          THEN RAISE EXCEPTION 'FIXTURE_PARTIAL_FAILED'; END IF;
      END $seed$;
      ${ownerScope(actor, workspaceId)}
      UPDATE public.form_draft SET definition=jsonb_set(definition,'{title}','"Changed draft title"'),
        revision=2,updated_by='${actor}',updated_at=now()
        WHERE workspace_id='${workspaceId}' AND form_id='${formId}';`),
  );
  return { ...fixture, ids, partial, publicId, budgetId: fieldIds.budget };
}
