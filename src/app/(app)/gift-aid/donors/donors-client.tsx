'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Eye, FileText, Plus, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  archiveDonor,
  createGiftAidDonor,
  unarchiveDonor,
  updateGiftAidDonor,
} from '@/lib/giftaid/actions';
import { GenerateDonorStatementDialog } from '@/components/gift-aid/generate-donor-statement-dialog';
import type { GiftAidDonorRow } from '@/lib/giftaid/types';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/ui/filter-bar';
import { SearchInput } from '@/components/ui/search-input';
import { ReportTableCard } from '@/components/reports/report-table-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type DonorFormState = {
  title: string;
  firstName: string;
  lastName: string;
  displayName: string;
  houseNameOrNumber: string;
  donorReferenceCode: string;
  fullName: string;
  email: string;
  phone: string;
  postcode: string;
  notes: string;
};

const EMPTY_FORM: DonorFormState = {
  title: '',
  firstName: '',
  lastName: '',
  displayName: '',
  houseNameOrNumber: '',
  donorReferenceCode: '',
  fullName: '',
  email: '',
  phone: '',
  postcode: '',
  notes: '',
};

function formatDate(value: string | null) {
  if (!value) return 'No donations yet';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function hasDonorName(form: DonorFormState) {
  return Boolean(
    form.fullName.trim() ||
      form.displayName.trim() ||
      form.firstName.trim() ||
      form.lastName.trim()
  );
}

export function DonorsClient({
  donors,
  canEdit,
}: {
  donors: GiftAidDonorRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createForm, setCreateForm] = useState<DonorFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<DonorFormState>(EMPTY_FORM);
  const [editingDonorId, setEditingDonorId] = useState<string | null>(null);
  const [statementForDonor, setStatementForDonor] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const filteredDonors = useMemo(() => {
    return donors.filter((donor) => {
      if (!query.trim()) return true;
      const search = query.toLowerCase();
      return [
        donor.full_name,
        donor.display_name,
        donor.donor_reference_code,
        donor.email,
        donor.phone,
        donor.house_name_or_number,
        donor.postcode,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(search));
    });
  }, [donors, query]);

  const handleCreate = () => {
    if (!hasDonorName(createForm)) {
      toast.error('Enter the donor name before saving.');
      return;
    }

    startTransition(async () => {
      const { success, error } = await createGiftAidDonor(createForm);
      if (!success || error) {
        toast.error(error ?? 'Unable to create donor.');
        return;
      }
      toast.success('Donor created.');
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      router.refresh();
    });
  };

  const openEdit = (donor: GiftAidDonorRow) => {
    setEditingDonorId(donor.id);
    setEditForm({
      fullName: donor.full_name,
      title: donor.title ?? '',
      firstName: donor.first_name ?? '',
      lastName: donor.last_name ?? '',
      displayName: donor.display_name ?? '',
      houseNameOrNumber: donor.house_name_or_number ?? '',
      donorReferenceCode: donor.donor_reference_code ?? donor.reference_code ?? '',
      email: donor.email ?? '',
      phone: donor.phone ?? '',
      postcode: donor.postcode ?? '',
      notes: donor.notes ?? '',
    });
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editingDonorId) return;
    if (!hasDonorName(editForm)) {
      toast.error('Enter the donor name before saving.');
      return;
    }

    startTransition(async () => {
      const { success, error } = await updateGiftAidDonor({
        donorId: editingDonorId,
        ...editForm,
      });
      if (!success || error) {
        toast.error(error ?? 'Unable to update donor.');
        return;
      }
      toast.success('Donor updated.');
      setEditOpen(false);
      setEditingDonorId(null);
      router.refresh();
    });
  };

  const handleArchiveToggle = (donor: GiftAidDonorRow) => {
    startTransition(async () => {
      const result = donor.is_active
        ? await archiveDonor(donor.id)
        : await unarchiveDonor(donor.id);
      if (!result.success || result.error) {
        toast.error(result.error ?? 'Unable to update donor status.');
        return;
      }
      toast.success(donor.is_active ? 'Donor archived.' : 'Donor restored.');
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="min-w-[260px] flex-1">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search donor records"
          />
        </div>
        {canEdit ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus size={14} className="mr-1" />
                Add donor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add donor</DialogTitle>
                <DialogDescription>
                  Create a donor record so donations and declarations can be matched for Gift Aid.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-donor-title">Title</Label>
                  <Input
                    id="create-donor-title"
                    value={createForm.title}
                    onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="create-donor-first-name">First name</Label>
                    <Input
                      id="create-donor-first-name"
                      value={createForm.firstName}
                      onChange={(event) => setCreateForm((current) => ({ ...current, firstName: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-donor-last-name">Last name</Label>
                    <Input
                      id="create-donor-last-name"
                      value={createForm.lastName}
                      onChange={(event) => setCreateForm((current) => ({ ...current, lastName: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="create-donor-display-name">Display name</Label>
                    <Input
                      id="create-donor-display-name"
                      value={createForm.displayName}
                      onChange={(event) => setCreateForm((current) => ({ ...current, displayName: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-donor-reference-code">Donor reference code</Label>
                    <Input
                      id="create-donor-reference-code"
                      value={createForm.donorReferenceCode}
                      onChange={(event) => setCreateForm((current) => ({ ...current, donorReferenceCode: event.target.value }))}
                      placeholder="Optional donor reference"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-donor-full-name">Legacy full name</Label>
                  <Input
                    id="create-donor-full-name"
                    value={createForm.fullName}
                    onChange={(event) => setCreateForm((current) => ({ ...current, fullName: event.target.value }))}
                    placeholder="Optional override"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="create-donor-email">Email</Label>
                    <Input
                      id="create-donor-email"
                      value={createForm.email}
                      onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-donor-phone">Phone</Label>
                    <Input
                      id="create-donor-phone"
                      value={createForm.phone}
                      onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="create-donor-house">House name or number</Label>
                    <Input
                      id="create-donor-house"
                      value={createForm.houseNameOrNumber}
                      onChange={(event) => setCreateForm((current) => ({ ...current, houseNameOrNumber: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-donor-postcode">Postcode</Label>
                    <Input
                      id="create-donor-postcode"
                      value={createForm.postcode}
                      onChange={(event) => setCreateForm((current) => ({ ...current, postcode: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-donor-notes">Notes</Label>
                  <Textarea
                    id="create-donor-notes"
                    value={createForm.notes}
                    onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))}
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isPending}>
                  {isPending ? 'Saving...' : 'Save donor'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </FilterBar>

      <ReportTableCard
        title="Donor records"
        description="Store the donor details HMRC needs for matched and validated Gift Aid donations."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Donor</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Declarations</TableHead>
                <TableHead>Donations</TableHead>
                <TableHead>Latest gift</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDonors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No donor records match the current search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredDonors.map((donor) => (
                  <TableRow key={donor.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{donor.display_name ?? donor.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[donor.title, donor.first_name, donor.last_name].filter(Boolean).join(' ') || donor.full_name}
                        </p>
                        {donor.donor_reference_code ? (
                          <p className="text-xs text-muted-foreground">Ref: {donor.donor_reference_code}</p>
                        ) : null}
                        <StatusBadge status={donor.is_active ? 'active' : 'inactive'} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>{donor.email ?? 'No email on file'}</p>
                        <p>{donor.phone ?? 'No phone on file'}</p>
                        <p>{donor.house_name_or_number ?? 'No house name/number on file'}</p>
                        <p>{donor.postcode ?? 'No postcode on file'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <p>{donor.active_declaration_count} active</p>
                        <p className="text-muted-foreground">{donor.declaration_count} total</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <p>{donor.validated_donation_count} validated</p>
                        <p className="text-muted-foreground">{donor.donation_count} linked donations</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(donor.latest_donation_date)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/gift-aid/donors/${donor.id}`}>
                            <Eye size={14} className="mr-1" />
                            View
                          </Link>
                        </Button>
                        {canEdit ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setStatementForDonor({
                                id: donor.id,
                                label: donor.display_name ?? donor.full_name,
                              })
                            }
                          >
                            <FileText size={14} className="mr-1" />
                            Statement
                          </Button>
                        ) : null}
                        {canEdit ? (
                          <>
                            <Button variant="outline" size="sm" onClick={() => openEdit(donor)}>
                              <Save size={14} className="mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleArchiveToggle(donor)}
                              disabled={isPending}
                            >
                              {donor.is_active ? (
                                <Archive size={14} className="mr-1" />
                              ) : (
                                <RotateCcw size={14} className="mr-1" />
                              )}
                              {donor.is_active ? 'Archive' : 'Restore'}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ReportTableCard>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit donor</DialogTitle>
            <DialogDescription>
              Update the donor record used for declarations and HMRC claim exports.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-donor-title">Title</Label>
              <Input
                id="edit-donor-title"
                value={editForm.title}
                onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-donor-first-name">First name</Label>
                <Input
                  id="edit-donor-first-name"
                  value={editForm.firstName}
                  onChange={(event) => setEditForm((current) => ({ ...current, firstName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-donor-last-name">Last name</Label>
                <Input
                  id="edit-donor-last-name"
                  value={editForm.lastName}
                  onChange={(event) => setEditForm((current) => ({ ...current, lastName: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-donor-display-name">Display name</Label>
                <Input
                  id="edit-donor-display-name"
                  value={editForm.displayName}
                  onChange={(event) => setEditForm((current) => ({ ...current, displayName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-donor-reference-code">Donor reference code</Label>
                <Input
                  id="edit-donor-reference-code"
                  value={editForm.donorReferenceCode}
                  onChange={(event) => setEditForm((current) => ({ ...current, donorReferenceCode: event.target.value }))}
                  placeholder="Optional donor reference"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-donor-full-name">Legacy full name</Label>
              <Input
                id="edit-donor-full-name"
                value={editForm.fullName}
                onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-donor-email">Email</Label>
                <Input
                  id="edit-donor-email"
                  value={editForm.email}
                  onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-donor-phone">Phone</Label>
                <Input
                  id="edit-donor-phone"
                  value={editForm.phone}
                  onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-donor-house">House name or number</Label>
                <Input
                  id="edit-donor-house"
                  value={editForm.houseNameOrNumber}
                  onChange={(event) => setEditForm((current) => ({ ...current, houseNameOrNumber: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-donor-postcode">Postcode</Label>
                <Input
                  id="edit-donor-postcode"
                  value={editForm.postcode}
                  onChange={(event) => setEditForm((current) => ({ ...current, postcode: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-donor-notes">Notes</Label>
              <Textarea
                id="edit-donor-notes"
                value={editForm.notes}
                onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {statementForDonor ? (
        <GenerateDonorStatementDialog
          key={statementForDonor.id}
          donorId={statementForDonor.id}
          donorLabel={statementForDonor.label}
          open
          onOpenChange={(next) => {
            if (!next) setStatementForDonor(null);
          }}
        />
      ) : null}
    </div>
  );
}
