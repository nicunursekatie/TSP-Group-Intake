import { useState, useMemo } from "react";
import { Link } from "wouter";
import { format, differenceInDays } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useIntakeRecords, useSyncFromPlatform } from "@/lib/queries";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { IntakeRecord } from "@/lib/types";

// --- Helpers ---

type SandwichPlanEntry = { type: string; count: number };

function parseSandwichPlan(sandwichType: string | null | undefined, sandwichCount: number): SandwichPlanEntry[] {
  if (sandwichType) {
    try {
      const parsed = JSON.parse(sandwichType);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [{ type: sandwichType, count: sandwichCount }];
    }
  }
  return sandwichCount > 0 ? [{ type: '', count: sandwichCount }] : [];
}

function getAllFlags(record: IntakeRecord): { label: string; variant: 'destructive' | 'warning' | 'stale' }[] {
  const flags: { label: string; variant: 'destructive' | 'warning' | 'stale' }[] = [];
  // Stored flags
  if (Array.isArray(record.flags)) {
    for (const f of record.flags) {
      flags.push({ label: f, variant: 'destructive' });
    }
  }
  if (record.status === 'Completed') return flags;
  // Computed flags
  if (record.eventDate) {
    const daysUntil = differenceInDays(new Date(record.eventDate), new Date());
    if (daysUntil < 0 && (record.status === 'In Process' || record.status === 'New')) {
      flags.push({ label: 'Awaiting response', variant: 'stale' });
    }
    if (daysUntil >= 0 && daysUntil <= 14) {
      const missing: string[] = [];
      if (!record.sandwichType) missing.push('type');
      if (record.sandwichCount <= 0) missing.push('count');
      if (!record.eventAddress && !record.location) missing.push('location');
      if (missing.length > 0) {
        flags.push({ label: `Needs: ${missing.join(', ')}`, variant: 'warning' });
      }
      if (daysUntil <= 3 && record.status === 'In Process') {
        flags.push({ label: 'Not yet scheduled', variant: 'destructive' });
      }
    }
  }
  return flags;
}

function daysFromToday(record: IntakeRecord): number | null {
  if (!record.eventDate) return null;
  return differenceInDays(new Date(record.eventDate), new Date());
}

// --- Section Definitions ---

interface SectionDef {
  id: string;
  icon: string;
  title: string;
  badgeColor: string;
  defaultOpen: boolean;
  filter: (records: IntakeRecord[]) => IntakeRecord[];
}

const SECTIONS: SectionDef[] = [
  {
    id: 'newrecs',
    icon: '🆕',
    title: 'New Requests — Reach Out ASAP',
    badgeColor: 'bg-indigo-600',
    defaultOpen: true,
    filter: (records) => records.filter(r => r.status === 'New'),
  },
  {
    id: 'needstype',
    icon: '⚠️',
    title: 'Action Needed: Assign Sandwich Type',
    badgeColor: 'bg-amber-600',
    defaultOpen: true,
    filter: (records) => {
      return records.filter(r => {
        if (r.status === 'Completed') return false;
        const flags = getAllFlags(r);
        return flags.some(f => f.label.includes('Needs: type') || f.label.includes('Needs:') && f.label.includes('type'));
      });
    },
  },
  {
    id: 'awaiting',
    icon: '📭',
    title: 'Awaiting Response — Event Date Passed',
    badgeColor: 'bg-slate-500',
    defaultOpen: true,
    filter: (records) => records.filter(r =>
      r.eventDate &&
      new Date(r.eventDate) < new Date() &&
      (r.status === 'In Process' || r.status === 'New')
    ),
  },
  {
    id: 'upcoming',
    icon: '📅',
    title: 'Upcoming Events',
    badgeColor: 'bg-teal-600',
    defaultOpen: true,
    filter: (records) => {
      // Upcoming = future date, scheduled or in process, and no action-level flags, and not New
      return records.filter(r => {
        if (!r.eventDate || r.status === 'New' || r.status === 'Completed') return false;
        if (new Date(r.eventDate) < new Date()) return false;
        const flags = getAllFlags(r);
        const hasActionFlag = flags.some(f =>
          f.label.includes('Needs: type') || f.label.includes('Needs:') && f.label.includes('type')
        );
        return !hasActionFlag;
      });
    },
  },
  {
    id: 'completed',
    icon: '✅',
    title: 'Completed',
    badgeColor: 'bg-slate-500',
    defaultOpen: false,
    filter: (records) => records.filter(r => r.status === 'Completed'),
  },
];

// --- Status pill colors ---

const STATUS_PILL: Record<string, { fg: string; bg: string; border: string }> = {
  'Scheduled':  { fg: 'text-teal-700',   bg: 'bg-teal-50',   border: 'border-teal-200' },
  'In Process': { fg: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  'New':        { fg: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  'Completed':  { fg: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
};

// --- Component ---

export default function Dashboard() {
  const { data: intakeRecords = [], isLoading } = useIntakeRecords();
  const syncMutation = useSyncFromPlatform();
  const [search, setSearch] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const s of SECTIONS) {
      if (!s.defaultOpen) initial.add(s.id);
    }
    return initial;
  });

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onError: (error: any) => {
        toast.error(error.message || "Sync failed");
      },
      onSuccess: (data) => {
        toast.success(data.message || "Synced with Main Platform");
      }
    });
  };

  // Filter by search
  const filteredRecords = useMemo(() => {
    if (!search.trim()) return intakeRecords;
    const q = search.toLowerCase();
    return intakeRecords.filter(r =>
      r.organizationName.toLowerCase().includes(q) ||
      r.contactName.toLowerCase().includes(q) ||
      (r.department || '').toLowerCase().includes(q)
    );
  }, [intakeRecords, search]);

  // Sort: soonest event date first within each section
  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      const dateA = a.eventDate ? new Date(a.eventDate).getTime() : Infinity;
      const dateB = b.eventDate ? new Date(b.eventDate).getTime() : Infinity;
      return dateA - dateB;
    });
  }, [filteredRecords]);

  // Build sections
  const sectionData = useMemo(() => {
    return SECTIONS.map(def => ({
      ...def,
      records: def.filter(sortedRecords),
    }));
  }, [sortedRecords]);

  // Stats
  const stats = useMemo(() => {
    const active = filteredRecords.filter(r => r.status !== 'Completed');
    const upcoming = filteredRecords.filter(r =>
      r.eventDate && new Date(r.eventDate) >= new Date() &&
      (r.status === 'Scheduled' || r.status === 'In Process' || r.status === 'New')
    );
    const totalSandwichesUpcoming = upcoming.reduce((sum, r) => sum + (r.sandwichCount || 0), 0);
    const needsType = active.filter(r => {
      const flags = getAllFlags(r);
      return flags.some(f => f.label.includes('Needs:') && f.label.includes('type'));
    }).length;
    const pastDue = active.filter(r =>
      r.eventDate && new Date(r.eventDate) < new Date() &&
      (r.status === 'In Process' || r.status === 'New')
    ).length;
    const newRequests = filteredRecords.filter(r => r.status === 'New').length;
    const scheduled = filteredRecords.filter(r => r.status === 'Scheduled').length;
    const completed = filteredRecords.filter(r => r.status === 'Completed').length;

    return {
      newRequests,
      upcoming: upcoming.length,
      sandwichesNeeded: totalSandwichesUpcoming,
      needsType,
      pastDue,
      scheduled,
      completed,
    };
  }, [filteredRecords]);

  // Action banner alerts — new requests first (highest priority)
  const alerts = useMemo(() => {
    const items: { text: string; count: number }[] = [];
    const newCount = filteredRecords.filter(r => r.status === 'New').length;
    if (newCount > 0)
      items.push({ text: `${newCount} new request${newCount > 1 ? 's' : ''} — reach out today`, count: newCount });
    if (stats.needsType > 0)
      items.push({ text: `${stats.needsType} need sandwich type assigned`, count: stats.needsType });
    if (stats.pastDue > 0)
      items.push({ text: `${stats.pastDue} event${stats.pastDue > 1 ? 's' : ''} awaiting response`, count: stats.pastDue });
    return items;
  }, [stats, filteredRecords]);

  // --- Render helpers ---

  const DaysLabel = ({ record }: { record: IntakeRecord }) => {
    const n = daysFromToday(record);
    if (n === null) return null;
    if (n === 0)  return <span className="text-red-600 font-bold text-[11px]">Today!</span>;
    if (n < 0)    return <span className="text-slate-500 font-medium text-[11px]">{Math.abs(n)}d ago</span>;
    if (n <= 3)   return <span className="text-red-600 font-semibold text-[11px]">in {n}d</span>;
    if (n <= 7)   return <span className="text-amber-600 font-semibold text-[11px]">in {n}d</span>;
    return <span className="text-slate-400 text-[11px]">in {n}d</span>;
  };

  const StatusPill = ({ status }: { status: string }) => {
    const colors = STATUS_PILL[status] || { fg: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' };
    return (
      <span className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        colors.fg, colors.bg, colors.border,
      )}>
        {status}
      </span>
    );
  };

  const FlagPill = ({ flag }: { flag: { label: string; variant: 'destructive' | 'warning' | 'stale' } }) => {
    if (flag.label.includes('Needs:')) {
      return (
        <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-2 py-0.5 text-[11px] font-semibold">
          ⚠ {flag.label}
        </span>
      );
    }
    if (flag.label.includes('High Volume')) {
      return (
        <span className="inline-flex items-center rounded-md border border-red-300 bg-red-50 text-red-800 px-2 py-0.5 text-[11px] font-semibold">
          🔴 {flag.label}
        </span>
      );
    }
    if (flag.variant === 'stale') {
      return (
        <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-50 text-slate-600 px-2 py-0.5 text-[11px] font-medium">
          📭 {flag.label}
        </span>
      );
    }
    if (flag.variant === 'destructive') {
      return (
        <span className="inline-flex items-center rounded-md border border-red-300 bg-red-50 text-red-800 px-2 py-0.5 text-[11px] font-semibold">
          {flag.label}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-md border border-indigo-300 bg-indigo-50 text-indigo-800 px-2 py-0.5 text-[11px]">
        {flag.label}
      </span>
    );
  };

  const renderRow = (record: IntakeRecord) => {
    const flags = getAllFlags(record);
    const isPastDue = record.eventDate &&
      (record.status === 'In Process' || record.status === 'New') &&
      new Date(record.eventDate) < new Date();

    const sandCount = record.sandwichCount || 0;
    const plan = parseSandwichPlan(record.sandwichType, record.sandwichCount);
    const typeStr = plan.filter(e => e.type && e.count > 0).map(e => e.type).join(', ');

    return (
      <TableRow
        key={record.id}
        className={cn(
          "hover:brightness-[0.97]",
          isPastDue && "bg-slate-50/50 border-l-[3px] border-l-slate-300",
        )}
      >
        <TableCell className="py-2.5 px-3.5 align-top">
          <StatusPill status={record.status} />
        </TableCell>
        <TableCell className="py-2.5 px-3.5 max-w-[240px] align-top">
          <div className="font-semibold text-slate-900 text-[13px] leading-tight">
            {record.organizationName}
            {record.department && (
              <span className="font-normal text-slate-400"> — {record.department}</span>
            )}
          </div>
          <div className="text-slate-500 text-[11px] mt-0.5">{record.contactName}</div>
        </TableCell>
        <TableCell className="py-2.5 px-3.5 whitespace-nowrap align-top">
          <div className="text-[13px] text-slate-700 font-medium">
            {record.eventDate ? format(new Date(record.eventDate), "MMM d, yyyy") : "—"}
          </div>
          <div className="mt-0.5">
            <DaysLabel record={record} />
          </div>
          {record.status === 'New' && record.createdAt && (() => {
            const age = differenceInDays(new Date(), new Date(record.createdAt));
            if (age === 0) return <div className="text-indigo-600 font-semibold text-[11px] mt-0.5">Received today</div>;
            if (age === 1) return <div className="text-indigo-600 font-medium text-[11px] mt-0.5">Received yesterday</div>;
            if (age <= 3) return <div className="text-amber-600 font-medium text-[11px] mt-0.5">Received {age}d ago</div>;
            return <div className="text-slate-500 font-medium text-[11px] mt-0.5">Received {age}d ago</div>;
          })()}
        </TableCell>
        <TableCell className="py-2.5 px-3.5 text-right text-[13px] text-slate-700 align-top">
          {record.attendeeCount != null && record.attendeeCount > 0
            ? record.attendeeCount.toLocaleString()
            : <span className="text-slate-300">—</span>
          }
        </TableCell>
        <TableCell className="py-2.5 px-3.5 text-right text-[13px] align-top">
          {sandCount > 0
            ? <strong className={cn(sandCount >= 500 ? "text-red-600" : "text-slate-900")}>{sandCount.toLocaleString()}</strong>
            : <span className="text-slate-300">—</span>
          }
        </TableCell>
        <TableCell className="py-2.5 px-3.5 align-top">
          {flags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {flags.map((flag, i) => <FlagPill key={i} flag={flag} />)}
            </div>
          ) : null}
        </TableCell>
        <TableCell className="py-2.5 px-3.5 text-right align-top">
          <Link href={`/intake/${record.id}`}>
            <button className="text-teal-600 text-xs font-medium px-3 py-1 border border-teal-600/25 rounded-md bg-white hover:bg-teal-50 transition-colors">
              Edit
            </button>
          </Link>
        </TableCell>
      </TableRow>
    );
  };

  const renderSection = (section: SectionDef & { records: IntakeRecord[] }) => {
    if (section.records.length === 0) return null;
    const isCollapsed = collapsedSections.has(section.id);

    return (
      <div key={section.id} className="rounded-[10px] border border-slate-200 overflow-hidden shadow-sm mb-3.5">
        {/* Section header */}
        <div
          onClick={() => toggleSection(section.id)}
          className={cn(
            "bg-white px-4 py-3 flex items-center gap-2.5 cursor-pointer select-none",
            !isCollapsed && "border-b border-slate-200",
          )}
        >
          <span className="text-[17px] leading-none">{section.icon}</span>
          <span className="font-bold text-slate-900 text-sm">{section.title}</span>
          <span className={cn(
            "text-white text-[11px] font-bold rounded-full px-2.5 py-px",
            section.badgeColor,
          )}>
            {section.records.length}
          </span>
          <span className="ml-auto text-slate-400 text-[13px]">
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>

        {/* Section body */}
        {!isCollapsed && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b-2 border-slate-200">
                  <TableHead className="py-2.5 px-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</TableHead>
                  <TableHead className="py-2.5 px-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Organization / Contact</TableHead>
                  <TableHead className="py-2.5 px-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Event Date</TableHead>
                  <TableHead className="py-2.5 px-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Attendees</TableHead>
                  <TableHead className="py-2.5 px-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Sandwiches</TableHead>
                  <TableHead className="py-2.5 px-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Flags</TableHead>
                  <TableHead className="py-2.5 px-3.5"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {section.records.map(record => renderRow(record))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-3.5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Intake Records</h1>
          <p className="text-muted-foreground mt-1">Manage and track event requests.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", syncMutation.isPending && "animate-spin")} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync with Platform'}
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="flex flex-wrap gap-2.5">
        <StatCard icon="🆕" value={stats.newRequests}                 label="New Requests"      color="text-indigo-600" bg="bg-indigo-50" borderColor="border-indigo-600/10" />
        <StatCard icon="📅" value={stats.upcoming}                    label="Upcoming"          color="text-teal-600"   bg="bg-teal-50"   borderColor="border-teal-600/10" />
        <StatCard icon="🥪" value={stats.sandwichesNeeded.toLocaleString()} label="Sandwiches Needed" color="text-sky-600"   bg="bg-sky-50"    borderColor="border-sky-600/10" />
        <StatCard icon="⚠️" value={stats.needsType}                   label="Need Type"         color="text-amber-600"  bg="bg-amber-50"  borderColor="border-amber-600/10" />
        <StatCard icon="📭" value={stats.pastDue}                     label="Awaiting Response"  color="text-slate-600"  bg="bg-slate-50"  borderColor="border-slate-300/30" />
        <StatCard icon="✅" value={stats.scheduled}                   label="Scheduled"         color="text-green-600"  bg="bg-green-50"  borderColor="border-green-600/10" />
      </div>

      {/* Action banner */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border-[1.5px] border-amber-400 rounded-[10px] px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-amber-800 font-bold text-[13px]">⚡ Action Required:</span>
          {alerts.map((alert, i) => (
            <span key={i} className="text-amber-800 text-[13px] bg-white border border-amber-300 rounded-md px-2.5 py-0.5">
              <strong>{alert.count}</strong> {alert.text.replace(/^\d+ /, '')}
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="flex gap-4 items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search organization or contact..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Sections */}
      {sectionData.every(s => s.records.length === 0) ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          No records found. Create a new intake to get started.
        </div>
      ) : (
        sectionData.map(section => renderSection(section))
      )}
    </div>
  );
}

// --- Stat Card ---

function StatCard({ icon, value, label, color, bg, borderColor }: {
  icon: string;
  value: string | number;
  label: string;
  color: string;
  bg: string;
  borderColor: string;
}) {
  return (
    <div className={cn(
      "flex-1 min-w-[100px] border rounded-[10px] px-4 py-3.5 flex flex-col gap-0.5",
      bg, borderColor,
    )}>
      <div className="text-lg">{icon}</div>
      <div className={cn("text-2xl font-extrabold leading-none", color)}>{value}</div>
      <div className="text-[11px] text-slate-500 font-medium mt-0.5">{label}</div>
    </div>
  );
}
