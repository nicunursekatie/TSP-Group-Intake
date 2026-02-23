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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Search,
  Calendar,
  Filter,
  RefreshCw,
  Loader2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useIntakeRecords, useSyncFromPlatform } from "@/lib/queries";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SortDirection = 'asc' | 'desc' | null;
type SortColumn = 'status' | 'organizationName' | 'eventDate' | 'attendeeCount' | 'sandwichCount' | null;

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

function formatSandwichSummary(plan: SandwichPlanEntry[]): string {
  const withCount = plan.filter(e => e.count > 0);
  if (withCount.length === 0) return '-';
  return withCount.map(e => `${e.count} ${e.type || 'TBD'}`).join(', ');
}

const STATUS_ORDER: Record<string, number> = {
  'New': 0,
  'In Process': 1,
  'Scheduled': 2,
  'Completed': 3,
};

// Auto-computed flags for a record
function computeFlags(record: any): { label: string; variant: 'destructive' | 'warning' }[] {
  const flags: { label: string; variant: 'destructive' | 'warning' }[] = [];
  if (record.status === 'Completed') return flags;

  if (record.eventDate) {
    const daysUntil = differenceInDays(new Date(record.eventDate), new Date());

    // Past-due: event date passed but still In Process
    if (daysUntil < 0 && record.status === 'In Process') {
      flags.push({ label: 'Past due', variant: 'destructive' });
    }

    // Upcoming events with missing fields
    if (daysUntil >= 0 && daysUntil <= 14) {
      const missingFields: string[] = [];
      if (!record.sandwichType) missingFields.push('type');
      if (record.sandwichCount <= 0) missingFields.push('count');
      if (!record.eventAddress && !record.location) missingFields.push('location');
      if (missingFields.length > 0) {
        flags.push({ label: `Needs: ${missingFields.join(', ')}`, variant: 'warning' });
      }
      if (daysUntil <= 3 && record.status === 'In Process') {
        flags.push({ label: 'Not yet scheduled', variant: 'destructive' });
      }
    }
  }

  return flags;
}

// Group key ordering
type GroupKey = 'New' | 'In Process' | 'Scheduled' | 'Completed';
const GROUP_ORDER: GroupKey[] = ['New', 'In Process', 'Scheduled', 'Completed'];

const GROUP_LABELS: Record<GroupKey, string> = {
  'New': 'New',
  'In Process': 'In Process',
  'Scheduled': 'Upcoming (Scheduled)',
  'Completed': 'Completed',
};

const GROUP_COLORS: Record<GroupKey, string> = {
  'New': 'text-blue-800 bg-blue-50 border-blue-200',
  'In Process': 'text-yellow-800 bg-yellow-50 border-yellow-200',
  'Scheduled': 'text-teal-800 bg-teal-50 border-teal-200',
  'Completed': 'text-green-800 bg-green-50 border-green-200',
};

export default function Dashboard() {
  const { data: intakeRecords = [], isLoading } = useIntakeRecords();
  const syncMutation = useSyncFromPlatform();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['Completed']));

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else {
      setSortColumn(null);
      setSortDirection(null);
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 text-muted-foreground/50" />;
    if (sortDirection === 'asc') return <ArrowUp className="h-3.5 w-3.5 ml-1 text-primary" />;
    return <ArrowDown className="h-3.5 w-3.5 ml-1 text-primary" />;
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

  // Filter records
  const filteredRecords = useMemo(() => {
    let records = intakeRecords.filter(record => {
      const matchesSearch =
        record.organizationName.toLowerCase().includes(search.toLowerCase()) ||
        record.contactName.toLowerCase().includes(search.toLowerCase()) ||
        (record.department || '').toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === "all" || record.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    // Sort within groups: soonest event date first
    const sortFn = (a: any, b: any) => {
      if (sortColumn && sortDirection) {
        let cmp = 0;
        switch (sortColumn) {
          case 'status':
            cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
            break;
          case 'organizationName':
            cmp = (a.organizationName || '').localeCompare(b.organizationName || '');
            break;
          case 'eventDate': {
            const dateA = a.eventDate ? new Date(a.eventDate).getTime() : Infinity;
            const dateB = b.eventDate ? new Date(b.eventDate).getTime() : Infinity;
            cmp = dateA - dateB;
            break;
          }
          case 'attendeeCount':
            cmp = (a.attendeeCount || 0) - (b.attendeeCount || 0);
            break;
          case 'sandwichCount':
            cmp = (a.sandwichCount || 0) - (b.sandwichCount || 0);
            break;
        }
        return sortDirection === 'desc' ? -cmp : cmp;
      }
      // Default: soonest date first
      const dateA = a.eventDate ? new Date(a.eventDate).getTime() : Infinity;
      const dateB = b.eventDate ? new Date(b.eventDate).getTime() : Infinity;
      return dateA - dateB;
    };

    return [...records].sort(sortFn);
  }, [intakeRecords, search, statusFilter, sortColumn, sortDirection]);

  // Group records by status
  const groupedRecords = useMemo(() => {
    const groups: Record<GroupKey, typeof filteredRecords> = {
      'New': [],
      'In Process': [],
      'Scheduled': [],
      'Completed': [],
    };

    for (const record of filteredRecords) {
      const status = record.status as GroupKey;
      if (groups[status]) {
        groups[status].push(record);
      }
    }

    return groups;
  }, [filteredRecords]);

  // Summary stats — all derived from filteredRecords so they respect search/status filters
  const stats = useMemo(() => {
    const activeRecords = filteredRecords.filter(r => r.status !== 'Completed');
    const scheduledRecords = filteredRecords.filter(r => r.status === 'Scheduled');

    // Sandwiches scheduled (upcoming only)
    const scheduledSandwiches = scheduledRecords.reduce((sum, r) => sum + (r.sandwichCount || 0), 0);

    // Records needing action: non-completed records with destructive flags
    const actionCount = activeRecords.filter(r => {
      const hasStoredFlags = Array.isArray(r.flags) && r.flags.length > 0;
      const hasComputedDestructive = computeFlags(r).some(f => f.variant === 'destructive');
      return hasStoredFlags || hasComputedDestructive;
    }).length;

    // This week: events in next 7 days
    const thisWeekCount = activeRecords.filter(r => {
      if (!r.eventDate) return false;
      const days = differenceInDays(new Date(r.eventDate), new Date());
      return days >= 0 && days <= 7;
    }).length;

    return { scheduledSandwiches, actionCount, thisWeekCount };
  }, [filteredRecords]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New': return "bg-blue-100 text-blue-800 border-blue-200";
      case 'In Process': return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case 'Scheduled': return "bg-teal-100 text-teal-800 border-teal-200";
      case 'Completed': return "bg-green-100 text-green-800 border-green-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // Render a single table row
  const renderRow = (record: any) => {
    const storedFlags = Array.isArray(record.flags) ? record.flags : [];
    const autoFlags = computeFlags(record);
    const allFlags = [
      ...storedFlags.map((f: string) => ({ label: f, variant: 'destructive' as const })),
      ...autoFlags,
    ];

    const isPastDue = record.eventDate &&
      record.status === 'In Process' &&
      differenceInDays(new Date(record.eventDate), new Date()) < 0;

    const isZeroAttendees = record.attendeeCount === 0 && record.status !== 'Completed';

    return (
      <TableRow
        key={record.id}
        className={cn(
          "hover:bg-muted/5",
          isPastDue && "bg-red-50/50",
          isZeroAttendees && !isPastDue && "opacity-60",
        )}
      >
        <TableCell>
          <Badge variant="outline" className={getStatusColor(record.status)}>
            {record.status}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="font-medium">
            {record.organizationName}
            {record.department && (
              <span className="font-normal text-muted-foreground"> — {record.department}</span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">{record.contactName}</div>
        </TableCell>
        <TableCell>
          <div className={cn(
            "flex items-center gap-2 text-sm",
            isPastDue && "text-red-700 font-medium",
          )}>
            <Calendar className={cn("h-3 w-3", isPastDue ? "text-red-500" : "text-muted-foreground")} />
            {record.eventDate ? format(new Date(record.eventDate), "MMM d, yyyy") : "-"}
            {isPastDue && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4 ml-1">
                Past due
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className={cn("text-right font-mono", isZeroAttendees && "text-muted-foreground")}>
          {record.attendeeCount != null ? record.attendeeCount : <span className="text-muted-foreground/50">-</span>}
        </TableCell>
        <TableCell>
          {(() => {
            const plan = parseSandwichPlan(record.sandwichType, record.sandwichCount);
            const summary = formatSandwichSummary(plan);
            if (summary === '-') return <span className="text-muted-foreground text-xs">-</span>;
            return (
              <div className="text-sm">
                <span className="font-mono font-bold text-primary">{record.sandwichCount}</span>
                <span className="text-muted-foreground ml-1.5">
                  {plan.filter(e => e.type && e.count > 0).map(e => e.type).join(', ') || ''}
                </span>
              </div>
            );
          })()}
        </TableCell>
        <TableCell>
          {allFlags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {allFlags.map((flag, i) => (
                <Badge
                  key={i}
                  variant={flag.variant === 'warning' ? 'outline' : 'destructive'}
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-5",
                    flag.variant === 'warning' && 'border-amber-300 bg-amber-50 text-amber-800'
                  )}
                >
                  {flag.label}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </TableCell>
        <TableCell>
          <Link href={`/intake/${record.id}`}>
            <Button variant="ghost" size="sm">Edit</Button>
          </Link>
        </TableCell>
      </TableRow>
    );
  };

  // Render a group header row
  const renderGroupHeader = (group: GroupKey, records: any[]) => {
    if (records.length === 0) return null;
    const isCollapsed = collapsedGroups.has(group);

    // Sandwich total for the group
    const groupSandwiches = records.reduce((sum, r) => sum + (r.sandwichCount || 0), 0);

    return (
      <>
        <TableRow
          key={`group-${group}`}
          className={cn("cursor-pointer hover:bg-muted/20 border-t-2", GROUP_COLORS[group])}
          onClick={() => toggleGroup(group)}
        >
          <TableCell colSpan={7} className="py-2.5">
            <div className="flex items-center gap-2">
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" />
              )}
              <span className="font-semibold text-sm">{GROUP_LABELS[group]}</span>
              <Badge variant="secondary" className="text-xs h-5 px-1.5">
                {records.length}
              </Badge>
              {groupSandwiches > 0 && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {groupSandwiches.toLocaleString()} sandwiches
                </span>
              )}
            </div>
          </TableCell>
        </TableRow>
        {!isCollapsed && records.map(record => renderRow(record))}
      </>
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
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
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
            <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync with Platform'}
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.actionCount > 0 && (
          <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800">{stats.actionCount} need attention</p>
              <p className="text-xs text-red-600">Past due or missing critical info</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <Calendar className="h-5 w-5 text-teal-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-teal-800">{stats.thisWeekCount} this week</p>
            <p className="text-xs text-teal-600">Events in the next 7 days</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-card border rounded-lg">
          <div className="h-5 w-5 text-primary font-bold text-sm flex items-center justify-center shrink-0">#</div>
          <div>
            <p className="text-sm font-semibold">{stats.scheduledSandwiches.toLocaleString()} sandwiches</p>
            <p className="text-xs text-muted-foreground">Scheduled total</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search organization or contact..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="In Process">In Process</SelectItem>
              <SelectItem value="Scheduled">Scheduled</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[130px]">
                <button onClick={() => handleSort('status')} className="flex items-center hover:text-primary transition-colors">
                  Status <SortIcon column="status" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort('organizationName')} className="flex items-center hover:text-primary transition-colors">
                  Organization <SortIcon column="organizationName" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort('eventDate')} className="flex items-center hover:text-primary transition-colors">
                  Event Date <SortIcon column="eventDate" />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button onClick={() => handleSort('attendeeCount')} className="flex items-center justify-end hover:text-primary transition-colors ml-auto">
                  Attendees <SortIcon column="attendeeCount" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort('sandwichCount')} className="flex items-center hover:text-primary transition-colors">
                  Sandwiches <SortIcon column="sandwichCount" />
                </button>
              </TableHead>
              <TableHead className="w-[200px]">Flags</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No records found. Create a new intake to get started.
                </TableCell>
              </TableRow>
            ) : statusFilter !== 'all' ? (
              // When filtering by specific status, show flat list (no grouping)
              filteredRecords.map(record => renderRow(record))
            ) : (
              // Grouped view
              GROUP_ORDER.map(group => renderGroupHeader(group, groupedRecords[group]))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
