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
} from "lucide-react";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_GROUP_LABELS,
  type IntakeRecord,
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

  // Compute checklist state
  const checklistState = useMemo(() => {
    const state: Record<string, boolean> = {};
    for (const item of CHECKLIST_ITEMS) {
      if (item.derivedFrom) {
        state[item.key] = item.derivedFrom(intake);
      } else {
        state[item.key] = intake.intakeChecklist?.[item.key] === true;
      }
    }
    return state;
  }, [intake]);

  const completedCount = Object.values(checklistState).filter(Boolean).length;
  const totalCount = CHECKLIST_ITEMS.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  const daysUntilEvent = intake.eventDate
    ? differenceInDays(new Date(intake.eventDate), new Date())
    : null;

  const isUrgent = daysUntilEvent !== null && daysUntilEvent <= 7 && daysUntilEvent >= 0;
  const eventPassed = daysUntilEvent !== null && daysUntilEvent < 0;

  const contactCount = intake.contactAttempts || 0;

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

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate(
      { id: intake.id, data: { status: newStatus } },
      {
        onSuccess: (record) => {
          toast.success(`Status updated to ${newStatus}`);
          queryClient.invalidateQueries({ queryKey: ["intake-records", intake.id] });
          // If scheduling and has external ID, push to platform
          if (newStatus === 'Scheduled' && intake.externalEventId) {
            pushMutation.mutate(intake.id, {
              onSuccess: () => toast.success("Synced to platform"),
              onError: (err: any) => toast.error(err.message || "Failed to sync"),
            });
          }
        },
      }
    );
  };

  // Group checklist items
  const groupedItems = useMemo(() => {
    const groups: Record<string, ChecklistItemDef[]> = {};
    for (const item of CHECKLIST_ITEMS) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, []);

  // Incomplete items for the Scheduled view
  const incompleteItems = CHECKLIST_ITEMS.filter(item => !checklistState[item.key]);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-5">
        {/* Status Header */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
              Workflow
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

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Intake Progress</span>
                <span className="text-muted-foreground">{completedCount}/{totalCount}</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            {/* Checklist Groups */}
            {Object.entries(groupedItems).map(([group, items]) => {
              const groupComplete = items.every(item => checklistState[item.key]);
              return (
                <div key={group} className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    {groupComplete && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                    {CHECKLIST_GROUP_LABELS[group] || group}
                  </h4>
                  <div className="space-y-1">
                    {items.map(item => {
                      const checked = checklistState[item.key];
                      const isDerived = !!item.derivedFrom;
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2 py-1 px-2 rounded text-sm cursor-pointer hover:bg-muted/50 transition-colors ${
                            checked ? 'text-muted-foreground' : ''
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
                          <span className={checked ? 'line-through' : ''}>
                            {item.label}
                            {isDerived && (
                              <span className="text-[10px] text-muted-foreground ml-1">(auto)</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Ready to Schedule */}
            <div className="border-t pt-3">
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => handleStatusChange('Scheduled')}
                disabled={updateMutation.isPending || pushMutation.isPending}
              >
                {updateMutation.isPending || pushMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Ready to Schedule
              </Button>
              {progressPercent < 80 && (
                <p className="text-xs text-muted-foreground text-center mt-1.5">
                  {totalCount - completedCount} items still incomplete
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

            {/* Outstanding Items */}
            {incompleteItems.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                  Outstanding Items ({incompleteItems.length})
                </h4>
                <div className="space-y-1">
                  {incompleteItems.map(item => {
                    const isDerived = !!item.derivedFrom;
                    return (
                      <label
                        key={item.key}
                        className="flex items-start gap-2 py-1 px-2 rounded text-sm cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={false}
                          disabled={isDerived}
                          onCheckedChange={(val) => {
                            if (!isDerived) {
                              handleChecklistToggle(item.key, val === true);
                            }
                          }}
                          className="mt-0.5 shrink-0"
                        />
                        <span>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {incompleteItems.length === 0 && (
              <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg p-3">
                <CheckCircle2 className="h-4 w-4" />
                All checklist items complete!
              </div>
            )}

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
                  className="w-full"
                  variant="outline"
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
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <CheckCircle2 className="h-6 w-6 mx-auto text-green-600 mb-1" />
              <p className="font-medium text-green-900">Event Complete</p>
              {intake.eventDate && (
                <p className="text-sm text-green-700">
                  {format(new Date(intake.eventDate), "MMMM d, yyyy")}
                </p>
              )}
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <p>Checklist: {completedCount}/{totalCount} confirmed</p>
              <p>{contactCount} contact attempt{contactCount !== 1 ? 's' : ''} logged</p>
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
