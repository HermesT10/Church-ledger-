import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AccountGroup {
  title: string;
  rows: Array<{ id: string; code: string; name: string; balance?: string }>;
}

export function AccountTreeCard({
  title = "Account Tree",
  groups,
}: {
  title?: string;
  groups: AccountGroup[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => (
          <div key={group.title} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {group.title}
            </p>
            <div className="space-y-2">
              {group.rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {row.code} · {row.name}
                    </p>
                  </div>
                  {row.balance ? (
                    <span className="text-sm font-semibold">{row.balance}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
