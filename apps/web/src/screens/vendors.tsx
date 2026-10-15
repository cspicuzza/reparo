import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import type { RouterOutputs } from '@reparo/api';
import { vendorCreateSchema, type VendorCreate, type VendorCreateInput } from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FileText, Mail, Pencil, Phone, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { EditPanel } from '@/components/edit-panel';
import { FileSection } from '@/components/file-section';
import { Field, FormError, Input, Textarea } from '@/components/form';
import { PageHeader } from '@/components/page-header';
import { PanelList } from '@/components/panel';
import { PlanGrid } from '@/components/plan-grid';
import { Button, buttonVariants } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import type { FileView } from '@/lib/upload';
import { jobCountText, telHref } from '@/lib/vendors';
import type { Job } from '@/lib/work';

type Vendor = RouterOutputs['vendors']['list'][number];

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

      {vendors.isPending ? <p className="text-muted-foreground">Loading vendors…</p> : null}
      {vendors.error ? (
        <p role="alert">Couldn&apos;t load vendors: {vendors.error.message}</p>
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
            <li key={v.id} className="px-4 py-4 sm:px-5">
              <VendorRow
                vendor={v}
                jobs={jobs.data?.filter((j) => j.vendorId === v.id) ?? []}
                documents={docs.data?.filter((f) => f.ownerId === v.id) ?? []}
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

function VendorRow({
  vendor,
  jobs,
  documents,
  canEdit,
  isAdmin,
}: {
  vendor: Vendor;
  jobs: Job[];
  documents: FileView[];
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const [showDocs, setShowDocs] = useState(false);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  useReturnFocus(editing ? `vendor-${vendor.id}` : null);
  const [confirming, setConfirming] = useState(false);
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.vendors.pathFilter()),
      queryClient.invalidateQueries(trpc.jobs.pathFilter()),
    ]);
  const update = useMutation(
    trpc.vendors.update.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setEditing(false);
      },
    }),
  );
  const archive = useMutation(trpc.vendors.remove.mutationOptions({ onSuccess: invalidate }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold break-words">{vendor.name}</h2>
          {vendor.trade ? <p className="text-muted-foreground">{vendor.trade}</p> : null}
        </div>
        {canEdit && !confirming ? (
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="ghost"
              aria-label={`Edit ${vendor.name}`}
              onClick={() => setEditing(true)}
              data-return-focus={`vendor-${vendor.id}`}
            >
              <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Edit
            </Button>
            {isAdmin ? (
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground"
                aria-label={`Archive ${vendor.name}`}
                onClick={() => setConfirming(true)}
              >
                Archive
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

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

      <div>
        <p className="text-sm text-muted-foreground">{jobCountText(vendor.jobCount)}</p>
        {jobs.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-x-4">
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
        ) : null}
      </div>

      {vendor.notes ? (
        <p className="max-w-prose text-muted-foreground whitespace-pre-wrap">{vendor.notes}</p>
      ) : null}

      {canEdit || documents.length > 0 ? (
        <div className="-ml-3">
          <Button
            type="button"
            variant="ghost"
            aria-expanded={showDocs}
            onClick={() => setShowDocs((v) => !v)}
          >
            <FileText aria-hidden className="size-4" />
            {showDocs
              ? 'Hide documents'
              : documents.length > 0
                ? `Documents (${documents.length})`
                : 'Add documents'}
            <span className="sr-only"> for {vendor.name}</span>
          </Button>
        </div>
      ) : null}
      {showDocs ? (
        <div className="rounded-xl border border-border bg-background p-4">
          <FileSection
            id={`vendor-docs-${vendor.id}`}
            title={`Documents for ${vendor.name}`}
            description="Insurance certificate, license, W-9. Add a caption to say which is which."
            files={documents}
            target={() => ({ ownerType: 'vendor', ownerId: vendor.id, kind: 'vendor_document' })}
            uploadLabel="Add documents"
            emptyText="No documents yet"
            canEdit={canEdit}
          />
        </div>
      ) : null}

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-3">
          <span className="min-w-0">
            Archive {vendor.name}? They stay on their jobs but aren&apos;t offered for new ones.
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={archive.isPending}
            onClick={() => archive.mutate({ id: vendor.id })}
          >
            Yes, archive
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </div>
      ) : null}
      {archive.error ? <FormError>{archive.error.message}</FormError> : null}

      <EditPanel
        open={editing}
        title={`Edit ${vendor.name}`}
        onClose={() => {
          update.reset();
          setEditing(false);
        }}
      >
        <VendorForm
          idPrefix={`vendor-${vendor.id}`}
          vendor={vendor}
          submitLabel="Save vendor"
          serverError={update.error?.message}
          onCancel={() => {
            update.reset();
            setEditing(false);
          }}
          onSubmit={async (values) => {
            await update.mutateAsync({ id: vendor.id, ...values }).catch(() => undefined);
          }}
        />
      </EditPanel>
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
      <div className="grid gap-5 @lg:grid-cols-2">
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
