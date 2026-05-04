'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { DonorOption, Option, ReconciliationType } from '../reconciliation-form-model';

type Setter<T> = (value: T) => void;

export function ReconciliationTypeSelector({
  value,
  onChange,
}: {
  value: ReconciliationType;
  onChange: Setter<ReconciliationType>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">What is this bank line?</p>
      <Select value={value} onValueChange={(next) => onChange(next as ReconciliationType)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="donation">Donation / Giving</SelectItem>
          <SelectItem value="income">Other Income</SelectItem>
          <SelectItem value="expense">Expense</SelectItem>
          <SelectItem value="transfer">Internal Transfer</SelectItem>
          <SelectItem value="lettings_income">Lettings Income</SelectItem>
          <SelectItem value="gift_aid_hmrc_payment">Gift Aid HMRC Payment</SelectItem>
          <SelectItem value="payroll_payment">Payroll Payment</SelectItem>
          <SelectItem value="adjustment">Adjustment</SelectItem>
          <SelectItem value="exclude">Exclude</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function OptionSelect({
  value,
  onChange,
  placeholder,
  options,
  noneValue = 'none',
  noneLabel,
}: {
  value: string;
  onChange: Setter<string>;
  placeholder: string;
  options: Option[];
  noneValue?: string;
  noneLabel?: string;
}) {
  return (
    <Select value={value || noneValue} onValueChange={(next) => onChange(next === noneValue ? '' : next)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel ? <SelectItem value={noneValue}>{noneLabel}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: Setter<boolean>;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm ${disabled ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4"
      />
      <span>{label}</span>
    </label>
  );
}

export function DonationReconcileForm(props: {
  donors: DonorOption[];
  funds: Option[];
  accounts: Option[];
  incomeStreams: Option[];
  donorId: string;
  setDonorId: Setter<string>;
  quickCreateDonor: boolean;
  setQuickCreateDonor: Setter<boolean>;
  quickDonorName: string;
  setQuickDonorName: Setter<string>;
  quickDonorEmail: string;
  setQuickDonorEmail: Setter<string>;
  quickDonorPostcode: string;
  setQuickDonorPostcode: Setter<string>;
  bankAlias: string;
  setBankAlias: Setter<string>;
  fundId: string;
  setFundId: Setter<string>;
  accountId: string;
  setAccountId: Setter<string>;
  incomeStreamId: string;
  setIncomeStreamId: Setter<string>;
  giftAidEligible: boolean;
  setGiftAidEligible: Setter<boolean>;
  addGiftAidFollowUp: boolean;
  setAddGiftAidFollowUp: Setter<boolean>;
  generateGiftAidDeclarationLink: boolean;
  setGenerateGiftAidDeclarationLink: Setter<boolean>;
  showGiftAidFollowUp: boolean;
  donorHasActiveGiftAidDeclaration: boolean;
  canGenerateGiftAidDeclarationLink: boolean;
  giftAidFollowUpHelperText: string;
  rememberBankReference: boolean;
  setRememberBankReference: Setter<boolean>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Gift Aid and statutory reporting use the <span className="font-medium text-foreground">income account</span> and{' '}
        <span className="font-medium text-foreground">fund</span>. Income stream is optional internal grouping.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionSelect value={props.donorId} onChange={props.setDonorId} placeholder="Donor" options={props.donors} noneValue="anonymous" noneLabel="Anonymous / not a donor" />
        <Button type="button" variant="outline" onClick={() => props.setQuickCreateDonor(!props.quickCreateDonor)}>
          {props.quickCreateDonor ? 'Use existing donor' : '+ Add new donor'}
        </Button>
        <OptionSelect value={props.fundId} onChange={props.setFundId} placeholder="Fund" options={props.funds} />
        <OptionSelect value={props.accountId} onChange={props.setAccountId} placeholder="Giving income account" options={props.accounts} />
      </div>
      <details className="rounded-xl border border-border/70 p-3">
        <summary className="cursor-pointer text-sm font-medium">Advanced: income stream</summary>
        <p className="mt-2 text-xs text-muted-foreground">Leave unset unless you need a specific stream for analytics or register mapping.</p>
        <div className="mt-2 max-w-md">
          <OptionSelect value={props.incomeStreamId} onChange={props.setIncomeStreamId} placeholder="Income stream" options={props.incomeStreams} noneLabel="No income stream" />
        </div>
      </details>
      {props.quickCreateDonor ? (
        <div className="grid gap-3 rounded-2xl border border-border/70 p-3 sm:grid-cols-2">
          <Input value={props.quickDonorName} onChange={(event) => props.setQuickDonorName(event.target.value)} placeholder="Donor full/display name" />
          <Input value={props.quickDonorEmail} onChange={(event) => props.setQuickDonorEmail(event.target.value)} placeholder="Email optional" />
          <Input value={props.quickDonorPostcode} onChange={(event) => props.setQuickDonorPostcode(event.target.value)} placeholder="Postcode optional" />
          <Input value={props.bankAlias} onChange={(event) => props.setBankAlias(event.target.value)} placeholder="Bank alias/reference" />
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <CheckboxRow checked={props.giftAidEligible} onChange={props.setGiftAidEligible} label="Assess as Gift Aid eligible" />
        <CheckboxRow checked={props.rememberBankReference} onChange={props.setRememberBankReference} label="Remember this bank reference for donor matching" />
      </div>
      {props.showGiftAidFollowUp ? (
        <div className="rounded-2xl border border-border/70 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Gift Aid follow-up</p>
              <p className="mt-1 text-xs text-muted-foreground">{props.giftAidFollowUpHelperText}</p>
            </div>
            {props.donorHasActiveGiftAidDeclaration ? <Badge variant="outline">Active declaration</Badge> : null}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <CheckboxRow
              checked={props.addGiftAidFollowUp}
              onChange={props.setAddGiftAidFollowUp}
              disabled={props.donorHasActiveGiftAidDeclaration}
              label="Add donor to Gift Aid declaration follow-up"
            />
            <CheckboxRow
              checked={props.generateGiftAidDeclarationLink}
              onChange={props.setGenerateGiftAidDeclarationLink}
              disabled={!props.addGiftAidFollowUp || !props.canGenerateGiftAidDeclarationLink}
              label="Generate Gift Aid declaration link"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function IncomeReconcileForm(props: {
  accounts: Option[];
  funds: Option[];
  incomeStreams: Option[];
  accountId: string;
  setAccountId: Setter<string>;
  fundId: string;
  setFundId: Setter<string>;
  incomeStreamId: string;
  setIncomeStreamId: Setter<string>;
  rememberBankReference: boolean;
  setRememberBankReference: Setter<boolean>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Post to the GL <span className="font-medium text-foreground">income account</span> and <span className="font-medium text-foreground">fund</span>. Income stream is optional analytics only.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionSelect value={props.accountId} onChange={props.setAccountId} placeholder="Income account" options={props.accounts} />
        <OptionSelect value={props.fundId} onChange={props.setFundId} placeholder="Fund" options={props.funds} />
        <CheckboxRow checked={props.rememberBankReference} onChange={props.setRememberBankReference} label="Remember this bank reference for future income matching" />
      </div>
      <details className="rounded-xl border border-border/70 p-3">
        <summary className="cursor-pointer text-sm font-medium">Advanced: income stream</summary>
        <p className="mt-2 text-xs text-muted-foreground">Leave unset unless you need a specific stream for reporting or mappings.</p>
        <div className="mt-2 max-w-md">
          <OptionSelect
            value={props.incomeStreamId}
            onChange={props.setIncomeStreamId}
            placeholder="Income stream"
            options={props.incomeStreams}
            noneLabel="No income stream"
          />
        </div>
      </details>
    </div>
  );
}

export function ExpenseReconcileForm(props: {
  suppliers: Option[];
  accounts: Option[];
  funds: Option[];
  supplierId: string;
  setSupplierId: Setter<string>;
  quickCreateSupplier: boolean;
  setQuickCreateSupplier: Setter<boolean>;
  quickSupplierName: string;
  setQuickSupplierName: Setter<string>;
  quickSupplierEmail: string;
  setQuickSupplierEmail: Setter<string>;
  supplierAlias: string;
  setSupplierAlias: Setter<string>;
  accountId: string;
  setAccountId: Setter<string>;
  fundId: string;
  setFundId: Setter<string>;
  rememberBankReference: boolean;
  setRememberBankReference: Setter<boolean>;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionSelect value={props.supplierId} onChange={props.setSupplierId} placeholder="Supplier" options={props.suppliers} noneLabel="No supplier" />
        <Button type="button" variant="outline" onClick={() => props.setQuickCreateSupplier(!props.quickCreateSupplier)}>
          {props.quickCreateSupplier ? 'Use existing supplier' : '+ Add new supplier'}
        </Button>
        <OptionSelect value={props.accountId} onChange={props.setAccountId} placeholder="Expense account" options={props.accounts} />
        <OptionSelect value={props.fundId} onChange={props.setFundId} placeholder="Fund" options={props.funds} />
      </div>
      {props.quickCreateSupplier ? (
        <div className="grid gap-3 rounded-2xl border border-border/70 p-3 sm:grid-cols-2">
          <Input value={props.quickSupplierName} onChange={(event) => props.setQuickSupplierName(event.target.value)} placeholder="Supplier name" />
          <Input value={props.quickSupplierEmail} onChange={(event) => props.setQuickSupplierEmail(event.target.value)} placeholder="Contact email optional" />
          <Input className="sm:col-span-2" value={props.supplierAlias} onChange={(event) => props.setSupplierAlias(event.target.value)} placeholder="Bank alias/reference" />
        </div>
      ) : null}
      <CheckboxRow checked={props.rememberBankReference} onChange={props.setRememberBankReference} label="Remember this bank reference for supplier matching" />
    </div>
  );
}

export function TransferReconcileForm(props: {
  accounts: Option[];
  fromAccountId: string;
  setFromAccountId: Setter<string>;
  toAccountId: string;
  setToAccountId: Setter<string>;
  directionLabel: string;
}) {
  return (
    <div className="space-y-3">
      <Badge variant="outline">{props.directionLabel}</Badge>
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionSelect value={props.fromAccountId} onChange={props.setFromAccountId} placeholder="From account" options={props.accounts} />
        <OptionSelect value={props.toAccountId} onChange={props.setToAccountId} placeholder="To account" options={props.accounts} />
      </div>
    </div>
  );
}

export function ExcludeReconcileForm(props: {
  excludeReason: string;
  setExcludeReason: Setter<string>;
  excludeNotes: string;
  setExcludeNotes: Setter<string>;
}) {
  return (
    <div className="space-y-3">
      <Select value={props.excludeReason} onValueChange={props.setExcludeReason}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="duplicate">Duplicate</SelectItem>
          <SelectItem value="opening_balance">Opening balance</SelectItem>
          <SelectItem value="informational_line">Informational line</SelectItem>
          <SelectItem value="bank_metadata">Bank metadata</SelectItem>
          <SelectItem value="other">Other</SelectItem>
        </SelectContent>
      </Select>
      <Textarea value={props.excludeNotes} onChange={(event) => props.setExcludeNotes(event.target.value)} placeholder="Reason notes" />
    </div>
  );
}

export function ReconciliationSummaryPreview({ summary }: { summary: string }) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-3 text-sm text-foreground">{summary}</CardContent>
    </Card>
  );
}
