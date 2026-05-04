import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TransactionRow {
  id: string;
  date: string;
  description: string;
  reference?: string;
  amount: string;
  href?: string;
}

export function TransactionTable({
  rows,
  title,
}: {
  rows: TransactionRow[];
  title?: string;
}) {
  return (
    <div className="space-y-3">
      {title ? <h3 className="text-base font-semibold">{title}</h3> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.date}</TableCell>
              <TableCell>
                {row.href ? (
                  <Link href={row.href} className="font-medium text-foreground hover:text-primary">
                    {row.description}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{row.description}</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{row.reference ?? "—"}</TableCell>
              <TableCell className="text-right font-medium">{row.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
