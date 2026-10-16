import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import type { RouterOutputs } from '@reparo/api';
import {
  vendorCreateSchema,
  vendorUpdateSchema,
  type VendorCreate,
  type VendorCreateInput,
} from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Mail, PanelRightOpen, Phone, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AutoSaveField } from '@/components/auto-save-field';
import { EditPanel } from '@/components/edit-panel';
import { PanelNameField } from '@/components/panel-name-field';
import { FileSection } from '@/components/file-section';
import { Field, FormError, Input, Textarea } from '@/components/form';
import { PageHeader } from '@/components/page-header';
import { PanelList } from '@/components/panel';
import { PlanGrid } from '@/components/plan-grid';
import { Button, buttonVariants } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { problemWith } from '@/lib/problem';
import { useToasts } from '@/lib/toasts';
import { trpcClient, useTRPC } from '@/lib/trpc';
import type { QuerySource } from '@/lib/load-problem';
import type { FileView } from '@/lib/upload';
import { jobCountText, telHref } from '@/lib/vendors';
import type { Job } from '@/lib/work';
import { LinesPlaceholder, ListPlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';
import { ConfirmRemove } from '@/components/confirm-remove';
import { useRefreshJobs } from '@/lib/refresh';

type Vendor = RouterOutputs['vendors']['list'][number];
type VendorUpdateInput = Parameters<typeof trpcClient.vendors.update.mutate>[0];

/**
 * Everyone we hire (M2, OD-47). Editors add and edit; the admin archives, which hides a vendor
 * from the picker while their jobs keep showing them, and can bring one back.
 */
export function Vendors() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { canEdit, isAdmin } = useMe();
  const vendors = useQuery(trpc.vendors.list.queryOptions());
  const archived = useQuery({
    ...trpc.vendors.list.queryOptions({ query: '', includeArchived: true }),
    enabled: isAdmin,
  });
  const jobs = useQuery(trpc.jobs.list.queryOptions());
  const docs = useQuery({
    ...trpc.files.listMany.queryOptions({
      ownerType: 'vendor',
      ownerIds: (vendors.data ?? []).map((v) => v.id),
    }),
    enabled: (vendors.data?.length ?? 0) > 0,
  });
  const [adding, setAdding] = useState(false);
  useReturnFocus(adding ? 'add-vendor' : null);
  // The open vendor lives in the address, so it can be linked to (OD-112, Q127).
  const search = useSearch({ from: '/_app/vendors/' });
  const navigate = useNavigate({ from: '/vendors/' });
  const invalidate = () => queryClient.invalidateQueries(trpc.vendors.pathFilter());
  const create = useMutation(
    trpc.vendors.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setAdding(false);
      },
    }),
  );
  const restore = useMutation(trpc.vendors.restore.mutationOptions({ onSuccess: invalidate }));
  const gone = archived.data?.filter((v) => v.archived) ?? [];

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title="Vendors"
        description="The people you hire. Add them here or right from a job."
        action={
          canEdit ? (
            <Button type="button" onClick={() => setAdding(true)} data-return-focus="add-vendor">
              <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Add a vendor
            </Button>
          ) : null
        }
      />

      <EditPanel
        open={adding}
        title="New vendor"
        onClose={() => {
          create.reset();
          setAdding(false);
        }}
      >
        <VendorForm
          idPrefix="new-vendor"
          submitLabel="Add vendor"
          serverError={create.error?.message}
          onCancel={() => {
            create.reset();
            setAdding(false);
          }}
          onSubmit={async (values) => {
            await create.mutateAsync(values).catch(() => undefined);
          }}
        />
      </EditPanel>

      {vendors.isPending ? <ListPlaceholder label="Loading vendors" rows={6} /> : null}
      {vendors.error ? (
        <LoadError what="the vendors" error={vendors.error} retry={[vendors]} />
      ) : null}
      {vendors.data && vendors.data.length === 0 ? (
        <PlanGrid className="h-56 flex-col gap-3 rounded-xl text-base">
          <span>No vendors yet.</span>
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(true)}
              data-return-focus="add-vendor"
            >
              <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Add the first vendor
            </Button>
          ) : null}
        </PlanGrid>
      ) : null}
      {vendors.data && vendors.data.length > 0 ? (
        <PanelList>
          {vendors.data.map((v) => (
            <li key={v.id} className="px-4 py-3 sm:px-5">
              <VendorRow
                vendor={v}
                jobs={jobs.data?.filter((j) => j.vendorId === v.id) ?? []}
                documents={docs.data?.filter((f) => f.ownerId === v.id) ?? []}
                sources={{ jobs, docs }}
                open={search.vendor === v.id}
                onOpen={() => void navigate({ search: { vendor: v.id } })}
                onClose={() => void navigate({ search: {}, replace: true })}
                canEdit={canEdit}
                isAdmin={isAdmin}
              />
            </li>
          ))}
        </PanelList>
      ) : null}

      {isAdmin && gone.length > 0 ? (
        <section aria-labelledby="archived-vendors">
          <h2 id="archived-vendors" className="text-2xl">
            Archived
          </h2>
          <p className="mt-1 text-muted-foreground">
            Not offered for new jobs. Their old jobs still show them.
          </p>
          <PanelList className="mt-3">
            {gone.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <span className="min-w-0">
                  <span className="block text-xl font-semibold">{v.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {[v.trade, jobCountText(v.jobCount)].filter(Boolean).join('. ')}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate({ id: v.id })}
                >
                  Bring back {v.name}
                </Button>
              </li>
            ))}
          </PanelList>
          {restore.error ? <FormError>{restore.error.message}</FormError> : null}
        </section>
      ) : null}
    </section>
  );
}

/**
 * One vendor per line (OD-93): name and what they do, how many jobs, and Details, which opens
 * the vendor's panel with everything else.
 */
function VendorRow({
  vendor,
  jobs,
  documents,
  sources,
  open,
  onOpen,
  onClose,
  canEdit,
  isAdmin,
}: {
  vendor: Vendor;
  jobs: Job[];
  documents: FileView[];
  /** Where the jobs and documents came from, so the panel shows loading honestly (OD-110). */
  sources: { jobs: QuerySource; docs: QuerySource };
  /** Whether the panel is open: `?vendor=` names this vendor. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  useReturnFocus(open ? `vendor-${vendor.id}` : null);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold break-words">{vendor.name}</h2>
        {vendor.trade ? <p className="text-sm text-muted-foreground">{vendor.trade}</p> : null}
      </div>
      <span className="text-sm text-muted-foreground">{jobCountText(vendor.jobCount)}</span>
      <Button
        type="button"
        variant="ghost"
        className="-mr-3"
        onClick={onOpen}
        data-return-focus={`vendor-${vendor.id}`}
      >
        <PanelRightOpen aria-hidden absoluteStrokeWidth strokeWidth={2} />
        Details
        <span className="sr-only"> for {vendor.name}</span>
      </Button>
      <EditPanel
        open={open}
        title={vendor.name}
        focusFirstField={false}
        heading={canEdit ? <VendorNameField vendor={vendor} /> : undefined}
        onClose={onClose}
      >
        <VendorBody
          vendor={vendor}
          jobs={jobs}
          documents={documents}
          sources={sources}
          canEdit={canEdit}
          isAdmin={isAdmin}
          onArchived={onClose}
        />
      </EditPanel>
    </div>
  );
}

/** Save part of a vendor, then refresh vendors and the jobs that show them. */
function useSaveVendor(id: string) {
  const refresh = useRefreshJobs();
  return async (patch: Omit<VendorUpdateInput, 'id'>) => {
    await trpcClient.vendors.update.mutate({ id, ...patch });
    await refresh();
  };
}

function VendorNameField({ vendor }: { vendor: Vendor }) {
  const save = useSaveVendor(vendor.id);
  return (
    <PanelNameField
      id={`vendor-name-${vendor.id}`}
      initial={vendor.name}
      what={`Name of ${vendor.name}`}
      validate={(v) => problemWith(vendorUpdateSchema.shape.name, v)}
      onSave={(v) => save({ name: v })}
    />
  );
}

/**
 * A vendor's panel. Editors change it in place: every field saves when you leave it (OD-89,
 * done here with OD-93). Everyone gets tap-to-call and email, the jobs, and the documents; the
 * admin can archive.
 */
function VendorBody({
  vendor,
  jobs,
  documents,
  sources,
  canEdit,
  isAdmin,
  onArchived,
}: {
  vendor: Vendor;
  jobs: Job[];
  documents: FileView[];
  sources: { jobs: QuerySource; docs: QuerySource };
  canEdit: boolean;
  isAdmin: boolean;
  onArchived: () => void;
}) {
  const trpc = useTRPC();
  const save = useSaveVendor(vendor.id);
  const toasts = useToasts();
  const refresh = useRefreshJobs();
  // Archiving offers Undo for 10 seconds, through the same restore as the archived list
  // (OD-113, Q129).
  const archive = useMutation(
    trpc.vendors.remove.mutationOptions({
      onSuccess: async () => {
        onArchived();
        await refresh();
        toasts.add({
          title: `Archived ${vendor.name}`,
          timeout: 10_000,
          actionProps: {
            children: 'Undo',
            onClick: () =>
              void trpcClient.vendors.restore
                .mutate({ id: vendor.id })
                .then(refresh)
                .catch(() => undefined),
          },
        });
      },
    }),
  );
  const id = (f: string) => `vendor-${vendor.id}-${f}`;
  const field = (
    name: 'trade' | 'phone' | 'email' | 'notes',
    label: string,
    extra: { hint?: string; multiline?: boolean; type?: 'text' } = {},
  ) => (
    <AutoSaveField
      id={id(name)}
      label={label}
      {...extra}
      initial={vendor[name]}
      what={`${label} for ${vendor.name}`}
      validate={(v) => problemWith(vendorUpdateSchema.shape[name], v)}
      onSave={(v) => save({ [name]: v })}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {vendor.phone || vendor.email ? (
        <div className="flex flex-wrap gap-2">
          {vendor.phone ? (
            <a href={telHref(vendor.phone)} className={buttonVariants({ variant: 'outline' })}>
              <Phone aria-hidden className="size-4" />
              {vendor.phone}
            </a>
          ) : null}
          {vendor.email ? (
            <a
              href={`mailto:${vendor.email}`}
              className={buttonVariants({ variant: 'outline', className: 'max-w-full break-all' })}
            >
              <Mail aria-hidden className="size-4 shrink-0" />
              {vendor.email}
            </a>
          ) : null}
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex flex-col gap-4">
          {field('trade', 'What they do', { hint: 'Like Plumber or Demo crew.' })}
          {field('phone', 'Phone')}
          {field('email', 'Email')}
          {field('notes', 'Notes', { multiline: true })}
        </div>
      ) : vendor.notes ? (
        <p className="max-w-prose whitespace-pre-wrap">{vendor.notes}</p>
      ) : null}

      <section aria-labelledby={id('jobs')}>
        <h3 id={id('jobs')} className="text-xl">
          Jobs
        </h3>
        {sources.jobs.isPending ? (
          <LinesPlaceholder label="Loading jobs" className="mt-2" />
        ) : sources.jobs.error ? (
          <LoadError
            what="their jobs"
            error={sources.jobs.error}
            retry={[sources.jobs]}
            className="mt-2"
          />
        ) : jobs.length > 0 ? (
          <ul className="mt-1 flex flex-col">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link
                  to="/jobs/$jobId"
                  params={{ jobId: j.id }}
                  className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  {j.name}, {j.phase.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-muted-foreground">{jobCountText(vendor.jobCount)}</p>
        )}
      </section>

      <FileSection
        id={id('docs')}
        title="Documents"
        description="Insurance certificate, license, W-9. Add a caption to say which is which."
        files={documents}
        source={sources.docs}
        target={() => ({ ownerType: 'vendor', ownerId: vendor.id, kind: 'vendor_document' })}
        uploadLabel="Add documents"
        emptyText="No documents yet"
        canEdit={canEdit}
      />

      {isAdmin ? (
        <div className="border-t border-border pt-4">
          <ConfirmRemove
            strong
            what={vendor.name}
            label={`Archive ${vendor.name}`}
            question={`Archive ${vendor.name}? They stay on their jobs but aren’t offered for new ones.`}
            confirmLabel="Yes, archive"
            disabled={archive.isPending}
            onConfirm={() => archive.mutate({ id: vendor.id })}
          />
          {archive.error ? <FormError>{archive.error.message}</FormError> : null}
        </div>
      ) : null}
    </div>
  );
}

function VendorForm({
  idPrefix,
  vendor,
  submitLabel,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  vendor?: Vendor;
  submitLabel: string;
  serverError: string | undefined;
  onSubmit: (values: VendorCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState } = useForm<VendorCreateInput, unknown, VendorCreate>({
    resolver: zodResolver(vendorCreateSchema),
    defaultValues: {
      name: vendor?.name ?? '',
      trade: vendor?.trade ?? '',
      phone: vendor?.phone ?? '',
      email: vendor?.email ?? '',
      notes: vendor?.notes ?? '',
    },
  });
  const errors = formState.errors;
  const id = (f: string) => `${idPrefix}-${f}`;

  const formRef = useFocusFirstField<HTMLFormElement>();
  return (
    <form ref={formRef} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-5">
      <div className="grid gap-5">
        <Field label="Name" htmlFor={id('name')} error={errors.name?.message}>
          <Input id={id('name')} autoComplete="off" {...register('name')} />
        </Field>
        <Field
          label="What they do"
          htmlFor={id('trade')}
          hint="Like Plumber or Demo crew."
          error={errors.trade?.message}
        >
          <Input id={id('trade')} autoComplete="off" {...register('trade')} />
        </Field>
        <Field label="Phone" htmlFor={id('phone')} error={errors.phone?.message}>
          <Input id={id('phone')} type="tel" autoComplete="off" {...register('phone')} />
        </Field>
        <Field label="Email" htmlFor={id('email')} error={errors.email?.message}>
          <Input id={id('email')} type="email" autoComplete="off" {...register('email')} />
        </Field>
      </div>
      <Field label="Notes" htmlFor={id('notes')} error={errors.notes?.message}>
        <Textarea id={id('notes')} rows={2} {...register('notes')} />
      </Field>
      {serverError ? <FormError>{serverError}</FormError> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={formState.isSubmitting}>
          {submitLabel}
        </Button>
        <Button type="button" onClick={onCancel} variant="ghost">
          Cancel
        </Button>
      </div>
      <UnsavedGuard
        when={formState.isDirty && !formState.isSubmitting && !formState.isSubmitSuccessful}
      />
    </form>
  );
}
