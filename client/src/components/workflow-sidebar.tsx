import { useMemo } from "react";
import { format, differenceInDays, isPast } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Phone,
  Send,
  Info,
} from "lucide-react";
import {
  INTAKE_CHECKLIST_ITEMS,
  DAY_OF_CHECKLIST_ITEMS,
  POST_EVENT_CHECKLIST_ITEMS,
  DAY_OF_GROUP_LABELS,
  AUDIENCE_LABELS,
  CRITICAL_INTAKE_FIELDS,
  hasDeli,
  type IntakeRecord,
  type IntakeStatus,
  type Task,
  type ChecklistItemDef,
} from "@/lib/types";
import { useUpdateIntakeRecord, usePushToPlatform } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface WorkflowSidebarProps {
  intake: IntakeRecord;
  tasks: Task[];
  tasksLoading: boolean;
}

export function WorkflowSidebar({ intake, tasks, tasksLoading }: WorkflowSidebarProps) {
  const updateMutation = useUpdateIntakeRecord();
  const pushMutation = usePushToPlatform();
  const queryClient = useQueryClient();

  // Compute checklist state for intake, day-of, and post-event items
  const checklistState = useMemo(() => {
    const state: Record<string, boolean> = {};
    for (const item of [...INTAKE_CHECKLIST_ITEMS, ...DAY_OF_CHECKLIST_ITEMS, ...POST_EVENT_CHECKLIST_ITEMS]) {
      if (item.derivedFrom) {
        state[item.key] = item.derivedFrom(intake);
      } else {
        state[item.key] = intake.intakeChecklist?.[item.key] === true;
      }
    }
    return state;
  }, [intake]);

  const intakeCompleted = INTAKE_CHECKLIST_ITEMS.filter((i) => checklistState[i.key]).length;
  const intakeTotal = INTAKE_CHECKLIST_ITEMS.length;
  const intakeProgressPercent = Math.round((intakeCompleted / intakeTotal) * 100);

  const dayOfCompleted = DAY_OF_CHECKLIST_ITEMS.filter((i) => checklistState[i.key]).length;
  const dayOfTotal = DAY_OF_CHECKLIST_ITEMS.length;

  const postEventCompleted = POST_EVENT_CHECKLIST_ITEMS.filter((i) => checklistState[i.key]).length;
  const postEventTotal = POST_EVENT_CHECKLIST_ITEMS.length;

  // Core intake fields required to transition In Process → Scheduled
  const isIntakeComplete = (): boolean => {
    const hasLocation = !!(intake.eventAddress || intake.location);
    const hasEventDate = !!intake.eventDate;
    const hasSandwichCount = intake.sandwichCount > 0;
    const hasSandwichType = !!intake.sandwichType;
    return hasLocation && hasEventDate && hasSandwichCount && hasSandwichType;
  };

  const daysUntilEvent = intake.eventDate
    ? differenceInDays(new Date(intake.eventDate), new Date())
    : null;

  const isUrgent = daysUntilEvent !== null && daysUntilEvent <= 7 && daysUntilEvent >= 0;
  const eventPassed = daysUntilEvent !== null && daysUntilEvent < 0;

  const contactCount = intake.contactAttempts || 0;

  // Check if record has deli types for refrigeration warnings
  const recordHasDeli = hasDeli(intake);

  const handleChecklistToggle = (key: string, checked: boolean) => {
    const updated = { ...intake.intakeChecklist, [key]: checked };
    updateMutation.mutate(
      { id: intake.id, data: { intakeChecklist: updated } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["intake-records", intake.id] });
        },
      }
    );
  };

  const handleStatusChange = (newStatus: IntakeStatus) => {
    updateMutation.mutate(
      { id: intake.id, data: { status: newStatus } },
      {
        onSuccess: (record) => {
          toast.success(`Status updated to ${newStatus}`);
          queryClient.invalidateQueries({ queryKey: ["intake-records", intake.id] });
          // If scheduling and has external ID, push to platform
          if ((newStatus === 'Scheduled' || newStatus === 'Completed') && intake.externalEventId) {
            pushMutation.mutate(intake.id, {
              onSuccess: () => toast.success("Synced to platform"),
              onError: (err: any) => toast.error(err.message || "Failed to sync"),
            });
          }
        },
      }
    );
  };

  // Group day-of items by category
  const groupedDayOfItems = useMemo(() => {
    const groups: Record<string, ChecklistItemDef[]> = {};
    for (const item of DAY_OF_CHECKLIST_ITEMS) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, []);

  const incompleteIntakeItems = INTAKE_CHECKLIST_ITEMS.filter((i) => !checklistState[i.key]);
  const incompleteDayOfItems = DAY_OF_CHECKLIST_ITEMS.filter((i) => !checklistState[i.key]);

  // For "New" status: which critical fields are already filled vs missing
  const criticalFieldStatus = useMemo(() => {
    return CRITICAL_INTAKE_FIELDS.map(f => ({
      ...f,
      filled: f.check(intake),
    }));
  }, [intake]);

  const filledCount = criticalFieldStatus.filter(f => f.filled).length;
  const missingCount = criticalFieldStatus.filter(f => !f.filled).length;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-5">
        {/* Status Header */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
              {intake.status === "Completed"
                ? "Post-Event"
                : intake.status === "Scheduled"
                  ? "Workflow"
                  : "Intake Checklist"}
            </h3>
            <Badge variant="outline" className="text-xs">
              {intake.status}
            </Badge>
          </div>
        </div>

        {/* === NEW STATUS === */}
        {intake.status === 'New' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
              <h4 className="font-medium text-blue-900 text-sm">Initial Outreach</h4>
              <p className="text-xs text-blue-700">
                Make your first contact attempt to move this request forward.
              </p>
              {intake.preferredContactMethod && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-800 mt-1">
                  <Phone className="h-3 w-3" />
                  Requester preferred: <span className="capitalize">{intake.preferredContactMethod}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                {contactCount > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={contactCount > 0 ? "text-green-700" : ""}>
                  Contact attempt recorded
                </span>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                {contactCount === 0
                  ? "Use the \"Log Contact\" button above to record your outreach."
                  : `${contactCount} attempt(s) logged. Status will update to In Process.`}
              </p>
            </div>

            {/* Data snapshot: what we already have vs what's missing */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Info className="h-3 w-3" />
                Data from request ({filledCount}/{criticalFieldStatus.length})
              </div>
              <div className="space-y-1">
                {criticalFieldStatus.map(field => (
                  <div key={field.key} className="flex items-center gap-2 text-sm py-0.5 px-2 rounded">
                    {field.filled ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={field.filled ? "text-muted-foreground" : "text-foreground"}>
                      {field.label}
                    </span>
                    {!field.filled && (
                      <span className="text-[10px] text-amber-600 font-medium ml-auto">needed</span>
                    )}
                  </div>
                ))}
              </div>
              {missingCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Gather the missing info during your first call.
                </p>
              )}
            </div>
          </div>
        )}

        {/* === IN PROCESS STATUS === */}
        {intake.status === 'In Process' && (
          <div className="space-y-4">
            {/* Urgency Warning */}
            {isUrgent && (
              <div className="bg-orange-50 border border-orange-300 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-orange-800">
                      Event in {daysUntilEvent} day{daysUntilEvent !== 1 ? 's' : ''}!
                    </p>
                    <p className="text-xs text-orange-700 mt-0.5">
                      Consider scheduling now, even if some items are incomplete.
                    </p>
                    <Button
                      size="sm"
                      className="mt-2 bg-orange-600 hover:bg-orange-700 text-white h-7 text-xs"
                      onClick={() => handleStatusChange('Scheduled')}
                      disabled={updateMutation.isPending}
                    >
                      Schedule Now
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Refrigeration Warning for deli types */}
            {recordHasDeli && !intake.refrigerationConfirmed && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      Refrigeration not confirmed
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      This event includes deli meat types that require confirmed refrigeration before scheduling.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Intake Progress (6–8 items only) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Intake Progress</span>
                <span className="text-muted-foreground">{intakeCompleted}/{intakeTotal}</span>
              </div>
              <Progress value={intakeProgressPercent} className="h-2" />
            </div>

            {/* Intake Checklist Items */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Complete during the intake call
              </h4>
              <div className="space-y-1">
                {INTAKE_CHECKLIST_ITEMS.map(item => {
                  const checked = checklistState[item.key];
                  const isDerived = !!item.derivedFrom;
                  const showAuto = item.showAutoTag === true && isDerived && checked;

                  // Special styling for refrigeration item when deli types selected
                  const isRefrigerationItem = item.key === 'refrigeration';
                  const showAmber = isRefrigerationItem && recordHasDeli && !checked;
                  // Grey out refrigeration for PBJ-only events
                  const isNA = isRefrigerationItem && !recordHasDeli && intake.sandwichType;

                  return (
                    <label
                      key={item.key}
                      className={`flex items-start gap-2 py-1 px-2 rounded text-sm transition-colors ${
                        isNA
                          ? "opacity-40"
                          : showAmber
                            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                            : showAuto
                              ? "bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200"
                              : checked
                                ? "text-muted-foreground"
                                : "hover:bg-muted/50 cursor-pointer"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={isDerived}
                        onCheckedChange={(val) => {
                          if (!isDerived) {
                            handleChecklistToggle(item.key, val === true);
                          }
                        }}
                        className="mt-0.5 shrink-0"
                      />
                      <span className={`flex-1 ${checked ? "line-through" : ""}`}>
                        {item.label}
                        {showAuto && (
                          <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-muted font-medium">
                            auto
                          </span>
                        )}
                        {isNA && (
                          <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-muted font-medium">
                            N/A (PBJ only)
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Ready to Schedule */}
            <div className="border-t pt-3">
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => handleStatusChange('Scheduled')}
                disabled={
                  updateMutation.isPending ||
                  pushMutation.isPending
                }
              >
                {updateMutation.isPending || pushMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Mark as Scheduled
              </Button>
              {!isIntakeComplete() && (
                <p className="text-xs text-amber-600 text-center mt-1.5">
                  You can still schedule, but you <strong>must</strong> confirm these before the day of: sandwich count, sandwich type (ideally several days before).
                  {(!intake.eventDate || !(intake.eventAddress || intake.location)) && (
                    <span className="block mt-1">
                      Also missing: {[
                        !intake.eventDate && 'event date',
                        !(intake.eventAddress || intake.location) && 'location',
                      ].filter(Boolean).join(', ')}
                    </span>
                  )}
                </p>
              )}
              {isIntakeComplete() && incompleteIntakeItems.length > 0 && (
                <p className="text-xs text-muted-foreground text-center mt-1.5">
                  {incompleteIntakeItems.length} optional item(s) remaining
                </p>
              )}
            </div>
          </div>
        )}

        {/* === SCHEDULED STATUS === */}
        {intake.status === 'Scheduled' && (
          <div className="space-y-4">
            {/* Event Countdown */}
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-center">
              <Calendar className="h-5 w-5 mx-auto text-teal-600 mb-1" />
              {intake.eventDate ? (
                <>
                  <p className="font-medium text-teal-900">
                    {format(new Date(intake.eventDate), "MMMM d, yyyy")}
                  </p>
                  {daysUntilEvent !== null && daysUntilEvent >= 0 && (
                    <p className="text-sm text-teal-700">
                      {daysUntilEvent === 0 ? "Today!" : `${daysUntilEvent} day${daysUntilEvent !== 1 ? 's' : ''} away`}
                    </p>
                  )}
                  {eventPassed && (
                    <p className="text-sm text-muted-foreground">Event has passed</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-teal-700">No event date set</p>
              )}
            </div>

            {/* Day-Of Operations Checklist */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Day-Of Operations ({dayOfCompleted}/{dayOfTotal})
              </h4>
              <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                Use this to confirm day-of requirements have been communicated to the right people (volunteer group, driver, etc.).
              </p>
              {incompleteDayOfItems.length === 0 && (
                <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 dark:bg-green-950/40 dark:text-green-200 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  All day-of items complete!
                </div>
              )}
              {Object.entries(groupedDayOfItems).map(([group, items]) => (
                <div key={group} className="space-y-1">
                  <h5 className="text-[10px] font-medium uppercase text-muted-foreground">
                    {DAY_OF_GROUP_LABELS[group] || group}
                  </h5>
                  {items.map(item => {
                    const checked = checklistState[item.key];
                    const audienceLabel = item.audience ? AUDIENCE_LABELS[item.audience] : null;
                    return (
                      <label
                        key={item.key}
                        className={`flex items-start gap-2 py-1 px-2 rounded text-sm cursor-pointer hover:bg-muted/50 ${
                          checked ? "text-muted-foreground" : ""
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) =>
                            handleChecklistToggle(item.key, val === true)
                          }
                          className="mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={checked ? "line-through" : ""}>{item.label}</span>
                          {audienceLabel && (
                            <span className="block text-[10px] text-muted-foreground mt-0.5">
                              for {audienceLabel}
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Timeline Tasks */}
            {tasks.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Timeline Tasks
                </h4>
                <div className="space-y-1.5">
                  {tasks
                    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                    .map(task => {
                      const overdue = !task.completed && isPast(new Date(task.dueDate));
                      return (
                        <div
                          key={task.id}
                          className={`flex items-center gap-2 text-sm py-1 px-2 rounded ${
                            task.completed ? 'text-muted-foreground line-through' : overdue ? 'text-red-700' : ''
                          }`}
                        >
                          {task.completed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          ) : overdue ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="flex-1">{task.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(task.dueDate), "MMM d")}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Mark Completed */}
            {eventPassed && (
              <div className="border-t pt-3">
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleStatusChange('Completed')}
                  disabled={updateMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark Completed
                </Button>
              </div>
            )}
          </div>
        )}

        {/* === COMPLETED STATUS === */}
        {intake.status === 'Completed' && (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
              <CheckCircle2 className="h-6 w-6 mx-auto text-green-600 dark:text-green-400 mb-1" />
              <p className="font-medium text-green-900 dark:text-green-100">Event Complete</p>
              {intake.eventDate && (
                <p className="text-sm text-green-700 dark:text-green-300">
                  {format(new Date(intake.eventDate), "MMMM d, yyyy")}
                </p>
              )}
            </div>

            {/* Post-Event Follow-Up Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Post-Event Follow-Up</span>
                <span className="text-muted-foreground">{postEventCompleted}/{postEventTotal}</span>
              </div>
              <Progress value={Math.round((postEventCompleted / postEventTotal) * 100)} className="h-2" />
            </div>

            <div className="space-y-1">
              {POST_EVENT_CHECKLIST_ITEMS.map(item => {
                const checked = checklistState[item.key];
                const isDerived = !!item.derivedFrom;
                const showAuto = item.showAutoTag === true && isDerived && checked;
                return (
                  <label
                    key={item.key}
                    className={`flex items-start gap-2 py-1.5 px-2 rounded text-sm transition-colors ${
                      showAuto
                        ? "bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200"
                        : checked
                          ? "text-muted-foreground"
                          : "hover:bg-muted/50 cursor-pointer"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={isDerived}
                      onCheckedChange={(val) => {
                        if (!isDerived) {
                          handleChecklistToggle(item.key, val === true);
                        }
                      }}
                      className="mt-0.5 shrink-0"
                    />
                    <span className={`flex-1 ${checked ? "line-through" : ""}`}>
                      {item.label}
                      {showAuto && (
                        <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-muted font-medium">
                          auto
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Summary stats */}
            <div className="border-t pt-3 text-center text-sm text-muted-foreground space-y-1">
              <p>Intake: {intakeCompleted}/{intakeTotal} · Day-of: {dayOfCompleted}/{dayOfTotal}</p>
              <p>{contactCount} contact attempt{contactCount !== 1 ? 's' : ''} logged</p>
              {intake.actualSandwichCount != null && intake.actualSandwichCount > 0 && (
                <p className="font-medium text-primary">
                  {intake.actualSandwichCount} sandwiches made
                  {intake.sandwichCount > 0 && (
                    <span className="text-muted-foreground font-normal"> (planned: {intake.sandwichCount})</span>
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Loading state for tasks */}
        {tasksLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
