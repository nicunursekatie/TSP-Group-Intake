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
  ArrowUpDown
} from "lucide-react";
import { useIntakeRecords, useSyncFromPlatform } from "@/lib/queries";
import { toast } from "sonner";

type IntakeStatus = 'New' | 'In Process' | 'Scheduled' | 'Completed';
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

export default function Dashboard() {
  const { data: intakeRecords = [], isLoading } = useIntakeRecords();
  const syncMutation = useSyncFromPlatform();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

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

  const filteredRecords = useMemo(() => {
    let records = intakeRecords.filter(record => {
      const matchesSearch =
        record.organizationName.toLowerCase().includes(search.toLowerCase()) ||
        record.contactName.toLowerCase().includes(search.toLowerCase()) ||
        (record.department || '').toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === "all" || record.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    // Default sort: Completed at the bottom, then soonest event date first
    records = [...records].sort((a, b) => {
      const aCompleted = a.status === 'Completed' ? 1 : 0;
      const bCompleted = b.status === 'Completed' ? 1 : 0;
      if (aCompleted !== bCompleted) return aCompleted - bCompleted;
      const dateA = a.eventDate ? new Date(a.eventDate).getTime() : Infinity;
      const dateB = b.eventDate ? new Date(b.eventDate).getTime() : Infinity;
      return dateA - dateB;
    });

    if (sortColumn && sortDirection) {
      records = [...records].sort((a, b) => {
        let cmp = 0;
        switch (sortColumn) {
          case 'status':
            cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
            break;
          case 'organizationName':
            cmp = (a.organizationName || '').localeCompare(b.organizationName || '');
            break;
          case 'eventDate': {
            const dateA = a.eventDate ? new Date(a.eventDate).getTime() : 0;
            const dateB = b.eventDate ? new Date(b.eventDate).getTime() : 0;
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
      });
    }

    return records;
  }, [intakeRecords, search, statusFilter, sortColumn, sortDirection]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New': return "bg-blue-100 text-blue-800 border-blue-200";
      case 'In Process': return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case 'Scheduled': return "bg-teal-100 text-teal-800 border-teal-200";
      case 'Completed': return "bg-green-100 text-green-800 border-green-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
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
              <TableHead className="w-[180px]">
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
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No records found. Create a new intake to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredRecords.map((record) => (
                <TableRow key={record.id} className="hover:bg-muted/5">
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
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {record.eventDate ? format(new Date(record.eventDate), "MMM d, yyyy") : "-"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {record.attendeeCount}
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
                    {(() => {
                      const storedFlags = Array.isArray(record.flags) ? record.flags : [];
                      // Auto-compute attention flags
                      const autoFlags: { label: string; variant: 'destructive' | 'warning' }[] = [];

                      if (record.status !== 'Completed') {
                        // Upcoming events (within 14 days) with missing critical fields
                        if (record.eventDate) {
                          const daysUntil = differenceInDays(new Date(record.eventDate), new Date());
                          if (daysUntil >= 0 && daysUntil <= 14) {
                            const missingFields: string[] = [];
                            if (!record.sandwichType) missingFields.push('type');
                            if (record.sandwichCount <= 0) missingFields.push('count');
                            if (!record.eventAddress && !record.location) missingFields.push('location');
                            if (missingFields.length > 0) {
                              autoFlags.push({ label: `Needs: ${missingFields.join(', ')}`, variant: 'warning' });
                            }
                            if (daysUntil <= 3 && record.status === 'In Process') {
                              autoFlags.push({ label: 'Not yet scheduled', variant: 'destructive' });
                            }
                          }
                        }
                      }

                      const allFlags = [
                        ...storedFlags.map(f => ({ label: f, variant: 'destructive' as const })),
                        ...autoFlags,
                      ];

                      return allFlags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {allFlags.map((flag, i) => (
                            <Badge
                              key={i}
                              variant={flag.variant === 'warning' ? 'outline' : 'destructive'}
                              className={`text-[10px] px-1 py-0 h-5 ${
                                flag.variant === 'warning'
                                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                                  : ''
                              }`}
                            >
                              {flag.label}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <Link href={`/intake/${record.id}`}>
                      <Button variant="ghost" size="sm">Edit</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
