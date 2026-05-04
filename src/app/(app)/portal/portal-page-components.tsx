import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function PortalSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function PortalEmpty({ label }: { label: string }) {
  return <p className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">{label}</p>;
}

export function PortalSubmissionRows({
  items,
}: {
  items: { id: string; title: string; amountPence: number; status: string; href: string; type?: string }[];
}) {
  if (items.length === 0) return <PortalEmpty label="No records to show." />;
  return (
    <div className="divide-y divide-border/70">
      {items.map((item) => (
        <Link key={`${item.type ?? 'row'}-${item.id}`} href={item.href} className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.amountPence / 100)}</p>
          </div>
          <Badge variant="outline">{item.status}</Badge>
        </Link>
      ))}
    </div>
  );
}
