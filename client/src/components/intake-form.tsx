import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  IntakeRecord,
  SECTION_CHECKLIST_MAP,
  DAY_OF_CHECKLIST_ITEMS,
  POST_EVENT_CHECKLIST_ITEMS,
  DAY_OF_GROUP_LABELS,
  AUDIENCE_LABELS,
  computeSectionStatus,
  computeSectionProgress,
  type ChecklistItemDef,
} from "@/lib/types";
import { format, differenceInDays } from "date-fns";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Copy, Save, Send, Loader2, MessageSquare, Plus, X, CheckCircle2, Camera, Truck, Users, Mic, ThermometerSnowflake, Calendar, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUpdateIntakeRecord, usePushToPlatform } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { ContactLogDialog } from "./contact-log-dialog";

type SandwichPlanEntry = { type: string; count: number };

function parseSandwichPlan(sandwichType: string | null | undefined, sandwichCount: number): SandwichPlanEntry[] {
  if (sandwichType) {
    try {
      const parsed = JSON.parse(sandwichType);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Legacy single-type format (e.g. "turkey")
      return [{ type: sandwichType, count: sandwichCount }];
    }
  }
  return [{ type: '', count: sandwichCount || 0 }];
}

const intakeSchema = z.object({
  organizationName: z.string().min(1, "Required"),
  organizationCategory: z.string().optional(),
  department: z.string().optional(),
  contactName: z.string().min(1, "Required"),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  preferredContactMethod: z.string().optional(),
  backupContactFirstName: z.string().optional(),
  backupContactLastName: z.string().optional(),
  backupContactEmail: z.string().optional(),
  backupContactPhone: z.string().optional(),
  backupContactRole: z.string().optional(),
  eventDate: z.string().optional(),
  eventStartTime: z.string().optional(),
  eventEndTime: z.string().optional(),
  eventTime: z.string().optional(),
  location: z.string().optional(),
  eventAddress: z.string().optional(),
  attendeeCount: z.coerce.number().min(0),
  sandwichCount: z.coerce.number().min(0),
  actualSandwichCount: z.coerce.number().optional(),
  sandwichType: z.string().optional(),
  message: z.string().optional(),
  dietaryRestrictions: z.string().optional(),
  requiresRefrigeration: z.boolean(),
  hasIndoorSpace: z.boolean(),
  hasRefrigeration: z.boolean(),
  refrigerationConfirmed: z.boolean(),
  refrigerationNotes: z.string().optional(),
  pickupTimeWindow: z.string().optional(),
  nextDayPickup: z.boolean(),
  deliveryInstructions: z.string().optional(),
  status: z.string(),
  planningNotes: z.string().optional(),
  schedulingNotes: z.string().optional(),
  nextAction: z.string().optional(),
  internalNotes: z.string().optional(),
});

type IntakeFormValues = z.infer<typeof intakeSchema>;


export function IntakeForm({ intake }: { intake: IntakeRecord }) {
  const updateMutation = useUpdateIntakeRecord();
  const pushMutation = usePushToPlatform();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [contactLogOpen, setContactLogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Multi-type sandwich planning
  const [sandwichPlan, setSandwichPlan] = useState<SandwichPlanEntry[]>(() =>
    parseSandwichPlan(intake.sandwichType, intake.sandwichCount)
  );
  const sandwichPlanInitial = useRef(true);

  const updateSandwichPlan = (newPlan: SandwichPlanEntry[]) => {
    setSandwichPlan(newPlan);
  };

  // Sync sandwich plan → form fields + debounced autosave
  useEffect(() => {
    const total = sandwichPlan.reduce((sum: number, e: SandwichPlanEntry) => sum + (e.count || 0), 0);
    const typeJson = JSON.stringify(sandwichPlan);
    form.setValue("sandwichCount", total);
    form.setValue("sandwichType", typeJson);

    if (sandwichPlanInitial.current) {
      sandwichPlanInitial.current = false;
      return;
    }

    const timeoutId = setTimeout(() => {
      updateMutation.mutate(
        { id: intake.id, data: { sandwichCount: total, sandwichType: typeJson } },
        {
          onSuccess: () => {
            setLastSaved(new Date());
            queryClient.invalidateQueries({ queryKey: ["intake-records", intake.id] });
          }
        }
      );
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [sandwichPlan]);

  const handleMarkScheduled = () => {
    // First update local status to Scheduled
    updateMutation.mutate(
      { id: intake.id, data: { status: 'Scheduled' } },
      {
        onSuccess: () => {
          // Then push to main platform
          pushMutation.mutate(intake.id, {
            onSuccess: () => {
              toast.success("Marked as scheduled and synced to platform");
              queryClient.invalidateQueries({ queryKey: ["intake-records", intake.id] });
            },
            onError: (error: any) => {
              toast.error(error.message || "Failed to sync to platform");
            },
          });
        },
      }
    );
  };

  const handleMarkCompleted = () => {
    updateMutation.mutate(
      { id: intake.id, data: { status: 'Completed' } },
      {
        onSuccess: () => {
          if (intake.externalEventId) {
            pushMutation.mutate(intake.id, {
              onSuccess: () => {
                toast.success("Marked as completed and synced to platform");
                queryClient.invalidateQueries({ queryKey: ["intake-records", intake.id] });
              },
              onError: (error: any) => {
                toast.error(error.message || "Failed to sync to platform");
              },
            });
          } else {
            toast.success("Marked as completed");
            queryClient.invalidateQueries({ queryKey: ["intake-records", intake.id] });
          }
        },
      }
    );
  };

  const form = useForm<IntakeFormValues>({
    resolver: zodResolver(intakeSchema),
    defaultValues: {
      organizationName: intake.organizationName,
      organizationCategory: intake.organizationCategory || "",
      department: intake.department || "",
      contactName: intake.contactName,
      contactEmail: intake.contactEmail || "",
      contactPhone: intake.contactPhone || "",
      preferredContactMethod: intake.preferredContactMethod || "",
      backupContactFirstName: intake.backupContactFirstName || "",
      backupContactLastName: intake.backupContactLastName || "",
      backupContactEmail: intake.backupContactEmail || "",
      backupContactPhone: intake.backupContactPhone || "",
      backupContactRole: intake.backupContactRole || "",
      eventDate: intake.eventDate
        ? format(new Date(intake.eventDate), "yyyy-MM-dd")
        : intake.scheduledEventDate
          ? format(new Date(intake.scheduledEventDate), "yyyy-MM-dd")
          : intake.desiredEventDate
            ? format(new Date(intake.desiredEventDate), "yyyy-MM-dd")
            : "",
      eventStartTime: intake.eventStartTime || "",
      eventEndTime: intake.eventEndTime || "",
      eventTime: intake.eventTime || "",
      location: intake.location || "",
      eventAddress: intake.eventAddress || "",
      attendeeCount: intake.attendeeCount,
      sandwichCount: intake.sandwichCount,
      actualSandwichCount: intake.actualSandwichCount ?? undefined,
      sandwichType: intake.sandwichType || "",
      message: intake.message || "",
      dietaryRestrictions: intake.dietaryRestrictions || "",
      requiresRefrigeration: intake.requiresRefrigeration,
      hasIndoorSpace: intake.hasIndoorSpace,
      hasRefrigeration: intake.hasRefrigeration,
      refrigerationConfirmed: intake.refrigerationConfirmed ?? false,
      refrigerationNotes: intake.refrigerationNotes || "",
      pickupTimeWindow: intake.pickupTimeWindow || "",
      nextDayPickup: intake.nextDayPickup ?? false,
      deliveryInstructions: intake.deliveryInstructions || "",
      status: intake.status,
      planningNotes: intake.planningNotes || "",
      schedulingNotes: intake.schedulingNotes || "",
      nextAction: intake.nextAction || "",
      internalNotes: intake.internalNotes || "",
    },
  });

  // Re-sync form when the intake prop updates (e.g. after refetch or external change)
  // keepDirtyValues: true preserves any fields the user has actively edited
  useEffect(() => {
    form.reset(
      {
        organizationName: intake.organizationName,
        organizationCategory: intake.organizationCategory || "",
        department: intake.department || "",
        contactName: intake.contactName,
        contactEmail: intake.contactEmail || "",
        contactPhone: intake.contactPhone || "",
        preferredContactMethod: intake.preferredContactMethod || "",
        backupContactFirstName: intake.backupContactFirstName || "",
        backupContactLastName: intake.backupContactLastName || "",
        backupContactEmail: intake.backupContactEmail || "",
        backupContactPhone: intake.backupContactPhone || "",
        backupContactRole: intake.backupContactRole || "",
        eventDate: intake.eventDate
          ? format(new Date(intake.eventDate), "yyyy-MM-dd")
          : intake.scheduledEventDate
            ? format(new Date(intake.scheduledEventDate), "yyyy-MM-dd")
            : intake.desiredEventDate
              ? format(new Date(intake.desiredEventDate), "yyyy-MM-dd")
              : "",
        eventStartTime: intake.eventStartTime || "",
        eventEndTime: intake.eventEndTime || "",
        eventTime: intake.eventTime || "",
        location: intake.location || "",
        eventAddress: intake.eventAddress || "",
        attendeeCount: intake.attendeeCount,
        sandwichCount: intake.sandwichCount,
        actualSandwichCount: intake.actualSandwichCount ?? undefined,
        sandwichType: intake.sandwichType || "",
        message: intake.message || "",
        dietaryRestrictions: intake.dietaryRestrictions || "",
        requiresRefrigeration: intake.requiresRefrigeration,
        hasIndoorSpace: intake.hasIndoorSpace,
        hasRefrigeration: intake.hasRefrigeration,
        refrigerationConfirmed: intake.refrigerationConfirmed ?? false,
        refrigerationNotes: intake.refrigerationNotes || "",
        pickupTimeWindow: intake.pickupTimeWindow || "",
        nextDayPickup: intake.nextDayPickup ?? false,
        deliveryInstructions: intake.deliveryInstructions || "",
        status: intake.status,
        planningNotes: intake.planningNotes || "",
        schedulingNotes: intake.schedulingNotes || "",
        nextAction: intake.nextAction || "",
        internalNotes: intake.internalNotes || "",
      },
      { keepDirtyValues: true }
    );
  }, [intake.updatedAt]); // Only re-sync when the record actually changes

  // Debounced autosave — only sends changed fields to avoid overwriting DB data
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let pendingUpdates: Record<string, any> = {};

    const subscription = form.watch((value, { name, type }) => {
      if (!name || type !== 'change') return;

      // Accumulate only the fields that actually changed
      const fieldValue = value[name as keyof typeof value];
      if (name === 'eventDate') {
        pendingUpdates.eventDate = fieldValue ? new Date(fieldValue as string).toISOString() : null;
      } else {
        pendingUpdates[name] = fieldValue;
      }

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const updates = { ...pendingUpdates };
        pendingUpdates = {};

        updateMutation.mutate(
          { id: intake.id, data: updates },
          {
            onSuccess: () => {
              setLastSaved(new Date());
              queryClient.invalidateQueries({ queryKey: ["intake-records", intake.id] });
            }
          }
        );
      }, 1000);
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [form, intake.id, updateMutation, queryClient]);

  // Derived flags for UI warnings
  const sandwichCount = form.watch("sandwichCount");
  const currentStatus = form.watch("status");
  const isPostSchedulingReady = currentStatus === "Scheduled" || currentStatus === "Completed";
  const requiresFridge = form.watch("requiresRefrigeration");
  const hasIndoor = form.watch("hasIndoorSpace");
  const refrigerationConfirmed = form.watch("refrigerationConfirmed");
  const nextDayPickup = form.watch("nextDayPickup");

  // Watched values for inline section progress indicators
  const watchedContactEmail = form.watch("contactEmail");
  const watchedContactPhone = form.watch("contactPhone");
  const watchedEventDate = form.watch("eventDate");
  const watchedEventStartTime = form.watch("eventStartTime");
  const watchedEventEndTime = form.watch("eventEndTime");
  const watchedLocation = form.watch("location");
  const watchedEventAddress = form.watch("eventAddress");
  const watchedSandwichType = form.watch("sandwichType");

  const sectionStatuses = useMemo(() => {
    const liveRecord: IntakeRecord = {
      ...intake,
      contactEmail: watchedContactEmail || '',
      contactPhone: watchedContactPhone || '',
      eventDate: watchedEventDate || '',
      eventStartTime: watchedEventStartTime || '',
      eventEndTime: watchedEventEndTime || '',
      location: watchedLocation || '',
      eventAddress: watchedEventAddress || '',
      sandwichType: watchedSandwichType || '',
      sandwichCount: sandwichCount || 0,
      refrigerationConfirmed: refrigerationConfirmed || false,
      hasIndoorSpace: hasIndoor || false,
    };
    return SECTION_CHECKLIST_MAP.map(section => ({
      ...section,
      status: computeSectionStatus(section, liveRecord),
      progress: computeSectionProgress(section, liveRecord),
      fieldStatuses: section.trackedFields.map(f => ({ key: f.key, complete: f.check(liveRecord) })),
    }));
  }, [
    intake, watchedContactEmail, watchedContactPhone,
    watchedEventDate, watchedEventStartTime, watchedEventEndTime,
    watchedLocation, watchedEventAddress, watchedSandwichType,
    sandwichCount, refrigerationConfirmed, hasIndoor,
  ]);

  const getSectionStatus = (sectionKey: string) => sectionStatuses.find(s => s.sectionKey === sectionKey);

  // Auto-set requiresRefrigeration based on sandwich types (deli meats need fridge) or next-day pickup
  const isDeli = sandwichPlan.some((e: SandwichPlanEntry) => e.type === 'turkey' || e.type === 'ham' || e.type === 'chicken');
  useEffect(() => {
    if ((isDeli || nextDayPickup) && !requiresFridge) {
      form.setValue("requiresRefrigeration", true, { shouldDirty: true });
    } else if (!isDeli && !nextDayPickup && sandwichPlan.some((e: SandwichPlanEntry) => e.type) && requiresFridge) {
      form.setValue("requiresRefrigeration", false, { shouldDirty: true });
    }
  }, [sandwichPlan, isDeli, nextDayPickup, requiresFridge, form]);

  const showVolumeWarning = sandwichCount >= 400;
  const showFridgeWarning = requiresFridge && !refrigerationConfirmed;
  const showIndoorWarning = !hasIndoor;

  const isIntakeComplete = (): boolean => {
    const v = form.getValues();
    const hasLocation = !!(v.eventAddress || v.location);
    const hasEventDate = !!v.eventDate;
    const hasSandwichCount = (v.sandwichCount ?? 0) > 0;
    const hasSandwichType = !!v.sandwichType;
    return hasLocation && hasEventDate && hasSandwichCount && hasSandwichType;
  };

  // Event urgency
  const daysUntilEvent = intake.eventDate
    ? differenceInDays(new Date(intake.eventDate), new Date())
    : null;
  const isUrgent = daysUntilEvent !== null && daysUntilEvent <= 7 && daysUntilEvent >= 0;
  const eventPassed = daysUntilEvent !== null && daysUntilEvent < 0;

  // Intake progress pill (7 items from event section)
  const intakeProgress = getSectionStatus('event');
  const intakeFilledCount = intakeProgress?.progress.filled ?? 0;
  const intakeTotalCount = intakeProgress?.progress.total ?? 0;

  // Day-of and post-event checklist state (from intakeChecklist jsonb)
  const checklistState = useMemo(() => {
    const state: Record<string, boolean> = {};
    for (const item of [...DAY_OF_CHECKLIST_ITEMS, ...POST_EVENT_CHECKLIST_ITEMS]) {
      if (item.derivedFrom) {
        state[item.key] = item.derivedFrom(intake);
      } else {
        state[item.key] = intake.intakeChecklist?.[item.key] === true;
      }
    }
    return state;
  }, [intake]);

  const dayOfCompleted = DAY_OF_CHECKLIST_ITEMS.filter((i) => checklistState[i.key]).length;
  const dayOfTotal = DAY_OF_CHECKLIST_ITEMS.length;
  const postEventCompleted = POST_EVENT_CHECKLIST_ITEMS.filter((i) => checklistState[i.key]).length;
  const postEventTotal = POST_EVENT_CHECKLIST_ITEMS.length;

  const groupedDayOfItems = useMemo(() => {
    const groups: Record<string, ChecklistItemDef[]> = {};
    for (const item of DAY_OF_CHECKLIST_ITEMS) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, []);

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

  // --- Transport & Staffing: stored in intakeChecklist ---
  const checklist = intake.intakeChecklist || {};
  const transportMode = (checklist as any).transport_mode || '';
  const needsSpeaker = (checklist as any).needs_speaker || false;
  const speakerNotes = (checklist as any).speaker_notes || '';
  const volunteerCountNeeded = (checklist as any).volunteer_count_needed || 0;
  const needsVan = (checklist as any).needs_van || false;

  const updateChecklist = (updates: Record<string, any>) => {
    const updated = { ...intake.intakeChecklist, ...updates };
    updateMutation.mutate(
      { id: intake.id, data: { intakeChecklist: updated } },
      {
        onSuccess: () => {
          setLastSaved(new Date());
          queryClient.invalidateQueries({ queryKey: ["intake-records", intake.id] });
        },
      }
    );
  };

  // Soft suggestions
  const suggestSpeaker = sandwichCount >= 500;
  const suggestVan = sandwichCount >= 1000 || nextDayPickup;

  const copySummary = () => {
    const v = form.getValues();
    const text = `
INTAKE SUMMARY
Org: ${v.organizationName}
Contact: ${v.contactName} (${v.contactEmail})
Event: ${v.eventDate} @ ${v.eventTime}
Loc: ${v.location}
Counts: ${v.attendeeCount} ppl / ${sandwichPlan.filter((e: SandwichPlanEntry) => e.count > 0).map((e: SandwichPlanEntry) => `${e.count} ${e.type || 'TBD'}`).join(', ') || 'TBD'}
Dietary: ${v.dietaryRestrictions || 'None'}
Risks: ${showVolumeWarning ? 'High Volume' : ''} ${showFridgeWarning ? 'Refrigeration Not Confirmed' : ''} ${showIndoorWarning ? 'Not Indoors' : ''}
    `.trim();
    navigator.clipboard.writeText(text);
    toast.success("Summary copied to clipboard");
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      {/* Sticky Action Bar */}
      <div className="bg-card p-3 rounded-lg border shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Left: Status dropdown */}
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger className="w-[150px] h-9 border-primary/20 bg-primary/5 font-medium text-primary text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="New" disabled={currentStatus !== "New"}>New</SelectItem>
                  <SelectItem value="In Process" disabled={currentStatus === "Scheduled" || currentStatus === "Completed"}>In Process</SelectItem>
                  <SelectItem value="Scheduled" disabled={currentStatus === "Completed"}>Scheduled</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            )}
          />

          {/* Middle: utility buttons */}
          <Button variant="outline" size="sm" onClick={copySummary} className="h-9">
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy Summary
          </Button>
          <Button size="sm" variant="outline" onClick={() => setContactLogOpen(true)} className="h-9">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Log Contact
            {(intake.contactAttempts ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                {intake.contactAttempts}
              </Badge>
            )}
          </Button>

          {/* Right: primary action + progress pill */}
          <div className="flex items-center gap-2 ml-auto">
            {lastSaved && (
              <span className="text-xs text-muted-foreground flex items-center gap-1 animate-in fade-in">
                <Save className="h-3 w-3" />
                {format(lastSaved, "h:mm a")}
              </span>
            )}

            {/* Progress pill for In Process */}
            {currentStatus === 'In Process' && (
              <span className={cn(
                "text-xs font-medium px-2.5 py-1 rounded-full",
                intakeFilledCount === intakeTotalCount
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              )}>
                {intakeFilledCount}/{intakeTotalCount} complete
              </span>
            )}

            {/* Primary action button */}
            {(currentStatus === 'New' || currentStatus === 'In Process') && (
              <Button
                size="sm"
                onClick={handleMarkScheduled}
                disabled={pushMutation.isPending || updateMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700 text-white h-9"
              >
                {pushMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                )}
                Mark Scheduled
              </Button>
            )}
            {currentStatus === 'Scheduled' && (
              <Button
                size="sm"
                onClick={handleMarkCompleted}
                disabled={pushMutation.isPending || updateMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white h-9"
              >
                {(pushMutation.isPending || updateMutation.isPending) ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Mark Completed
              </Button>
            )}
          </div>
        </div>

        {/* Urgency warning banner */}
        {isUrgent && currentStatus !== 'Completed' && (
          <div className="flex items-center gap-2 mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-sm text-orange-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Event in {daysUntilEvent} day{daysUntilEvent !== 1 ? 's' : ''}!</span>
            <span className="text-orange-600">Consider scheduling now.</span>
          </div>
        )}

        {/* Refrigeration warning banner */}
        {isDeli && !refrigerationConfirmed && (currentStatus === 'In Process' || currentStatus === 'New') && (
          <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Refrigeration not confirmed — deli meat requires confirmed refrigeration before scheduling.
          </div>
        )}

        {/* Scheduling incomplete warning */}
        {(currentStatus === 'In Process') && !isIntakeComplete() && (
          <p className="text-xs text-amber-600 mt-2">
            You can still schedule, but you <strong>must</strong> confirm sandwich count and type before the event date.
          </p>
        )}
      </div>

      {/* Event countdown for Scheduled status */}
      {currentStatus === 'Scheduled' && intake.eventDate && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 flex items-center justify-center gap-3 text-center">
          <Calendar className="h-5 w-5 text-teal-600" />
          <div>
            <span className="font-medium text-teal-900">{format(new Date(intake.eventDate), "MMMM d, yyyy")}</span>
            {daysUntilEvent !== null && daysUntilEvent >= 0 && (
              <span className="text-sm text-teal-700 ml-2">
                — {daysUntilEvent === 0 ? "Today!" : `${daysUntilEvent} day${daysUntilEvent !== 1 ? 's' : ''} away`}
              </span>
            )}
            {eventPassed && (
              <span className="text-sm text-muted-foreground ml-2">— Event has passed</span>
            )}
          </div>
        </div>
      )}

      <Form {...form}>
        <form className="space-y-6">
          <Accordion type="multiple" defaultValue={[
            "contact", "event", "logistics",
            ...(currentStatus === 'Scheduled' ? ["dayof"] : []),
            ...(currentStatus === 'Completed' ? ["dayof", "followup"] : []),
          ]} className="space-y-4">
            
            {/* Contact Information */}
            <AccordionItem value="contact" className="border rounded-lg bg-card px-4 shadow-sm">
              <AccordionTrigger className="hover:no-underline py-4">
                <span className="font-semibold text-lg">1. Contact & Organization</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-6 space-y-6">
                <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                  Start here. Ask for organization name, primary contact, and how they prefer to be reached.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="organizationName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Community Center" {...field} className="h-11 font-medium text-lg" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="organizationCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="corp">Corporate</SelectItem>
                            <SelectItem value="nonprofit">Nonprofit</SelectItem>
                            <SelectItem value="school">School</SelectItem>
                            <SelectItem value="church_faith">Church / Faith</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Full Name" {...field} className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Events, HR" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem id="field-contactEmail">
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="email@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem id="field-contactPhone">
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="(555) 123-4567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="preferredContactMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preferred Contact Method</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="From their initial message" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="call">Phone Call</SelectItem>
                            <SelectItem value="text">Text Message</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Backup Contact */}
                <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                  <h4 className="font-medium text-sm mb-3 text-muted-foreground uppercase tracking-wider">Backup Contact</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="backupContactFirstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input placeholder="First name" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="backupContactLastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Last name" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="backupContactEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="backup@example.com" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="backupContactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="(555) 123-4567" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="backupContactRole"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role / Title</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Events Coordinator" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Message from requester */}
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message / Additional Info</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Any other info about the group or request..." {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Event Details */}
            <AccordionItem value="event" className="border rounded-lg bg-card px-4 shadow-sm">
              <AccordionTrigger className="hover:no-underline py-4">
                 <span className="font-semibold text-lg">2. Event Details</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-6 space-y-6">
                <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                  Get event date, time, location, and sandwich count/type. Confirm indoor space and refrigeration.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="eventDate"
                    render={({ field }) => (
                      <FormItem id="field-event_date">
                        <FormLabel>Event Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="h-11" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Ask: When would work for your group?
                        </FormDescription>
                        {(intake.desiredEventDate || intake.scheduledEventDate) && (
                          <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                            {intake.desiredEventDate && (
                              <p>Requested: {format(new Date(intake.desiredEventDate), "MMM d, yyyy")}</p>
                            )}
                            {intake.scheduledEventDate && (
                              <p className="text-teal-600 font-medium">Scheduled: {format(new Date(intake.scheduledEventDate), "MMM d, yyyy")}</p>
                            )}
                            {intake.dateFlexible && (
                              <p className="italic">Date is flexible</p>
                            )}
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="eventStartTime"
                    render={({ field }) => (
                      <FormItem id="field-event_time">
                        <FormLabel>Start Time</FormLabel>
                        <FormDescription className="text-xs">
                          Ask: What time will the event start and end?
                        </FormDescription>
                        <FormControl>
                          <Input placeholder="e.g. 11:00 AM" {...field} className="h-11" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="eventEndTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 2:00 PM" {...field} className="h-11" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem id="field-event_address" className="md:col-span-2">
                        <FormLabel>Location / Address</FormLabel>
                        <FormDescription className="text-xs">
                          Ask: Where will sandwiches be made? (Full address)
                        </FormDescription>
                        <FormControl>
                          <Input placeholder="123 Main St, City, State" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pickupTimeWindow"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pickup Time</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 2:00 PM" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Time the driver will pick up sandwiches (may be same as event end time)
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nextDayPickup"
                    render={({ field }) => (
                      <FormItem className="flex items-start space-x-2 space-y-0 pt-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div>
                          <FormLabel className="text-sm font-medium cursor-pointer">
                            Next-day pickup
                          </FormLabel>
                          <FormDescription className="text-xs">
                            Sandwiches held overnight — driver picks up the following day
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
                {nextDayPickup && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span className="text-amber-800 dark:text-amber-200">
                      Next-day pickup requires confirmed refrigeration for overnight storage.
                    </span>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">Scheduling & pickup notes</label>
                  <Textarea
                    placeholder="Why this date/time? Why next-day pickup? Any scheduling constraints discussed..."
                    value={(checklist as any).scheduling_pickup_notes || ''}
                    onChange={(e) => updateChecklist({ scheduling_pickup_notes: e.target.value })}
                    className="min-h-[60px] text-sm"
                  />
                </div>

                <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                  <h4 className="font-medium text-sm mb-3 text-muted-foreground uppercase tracking-wider">Quantities & Type</h4>
                  <div className="mb-4">
                    <FormField
                      control={form.control}
                      name="attendeeCount"
                      render={({ field }) => (
                        <FormItem className="max-w-[200px]">
                          <FormLabel>Total Attendees</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} className="h-12 text-lg font-mono" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div id="field-sandwich_type">
                    <label className="text-sm font-medium mb-2 block">Sandwiches Planned</label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Ask: How many sandwiches do you need, and what types? (Turkey, ham, chicken, or PBJ)
                    </p>
                    <div className="space-y-2">
                      {sandwichPlan.map((entry: SandwichPlanEntry, index: number) => (
                        <div key={index} className="flex items-center gap-2">
                          <Select
                            value={entry.type}
                            onValueChange={(val: string) => {
                              const newPlan = [...sandwichPlan];
                              newPlan[index] = { ...newPlan[index], type: val };
                              updateSandwichPlan(newPlan);
                            }}
                          >
                            <SelectTrigger className="h-10 w-[160px]">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="turkey">Turkey</SelectItem>
                              <SelectItem value="ham">Ham</SelectItem>
                              <SelectItem value="chicken">Chicken (Deli)</SelectItem>
                              <SelectItem value="pbj">PBJ</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            value={entry.count || ''}
                            onChange={(e: any) => {
                              const newPlan = [...sandwichPlan];
                              newPlan[index] = { ...newPlan[index], count: parseInt(e.target.value) || 0 };
                              updateSandwichPlan(newPlan);
                            }}
                            placeholder="# sandwiches"
                            className="h-10 w-[140px] font-mono font-bold text-primary"
                          />
                          {sandwichPlan.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 shrink-0"
                              onClick={() => updateSandwichPlan(sandwichPlan.filter((_: SandwichPlanEntry, i: number) => i !== index))}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => updateSandwichPlan([...sandwichPlan, { type: '', count: 0 }])}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Type
                    </Button>

                    {sandwichPlan.length > 1 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Total: <span className="font-mono font-bold text-primary">{sandwichPlan.reduce((s: number, e: SandwichPlanEntry) => s + (e.count || 0), 0)}</span> sandwiches
                      </p>
                    )}

                    {showVolumeWarning && (
                      <p className="text-destructive text-sm font-medium flex items-center mt-1">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Over 400: Requires TSP Rep
                      </p>
                    )}
                  </div>
                  <div className="mt-3">
                    <label className="text-sm font-medium text-muted-foreground block mb-1">Sandwich planning notes</label>
                    <Textarea
                      placeholder="Why this count/type? Any discussion about types, allergies in the group, changes from original request..."
                      value={(checklist as any).sandwich_notes || ''}
                      onChange={(e) => updateChecklist({ sandwich_notes: e.target.value })}
                      className="min-h-[60px] text-sm"
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="dietaryRestrictions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dietary Restrictions / Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Vegetarian, Gluten Free, Allergies..." {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Indoor & Refrigeration — intake call confirmations */}
                <div className="p-4 bg-muted/30 rounded-lg border border-border/50 space-y-4">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                    Confirm on the call
                  </h4>
                  <FormField
                    control={form.control}
                    name="hasIndoorSpace"
                    render={({ field }) => (
                      <FormItem id="field-indoor_confirmed" className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Event is taking place indoors?</FormLabel>
                          <FormDescription>
                            Ask: Will sandwiches be made indoors? (Under no circumstances can sandwiches be made outdoors.)
                          </FormDescription>
                          {!field.value && (
                            <p className="text-destructive text-sm font-medium mt-2 flex items-center">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              CRITICAL: Sandwiches cannot be made outdoors
                            </p>
                          )}
                        </div>
                      </FormItem>
                    )}
                  />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground block mb-1">Indoor space notes</label>
                    <Textarea
                      placeholder="Details about the space: kitchen access, counter space, room size, anything relevant for the day of..."
                      value={(checklist as any).indoor_notes || ''}
                      onChange={(e) => updateChecklist({ indoor_notes: e.target.value })}
                      className="min-h-[60px] text-sm"
                    />
                  </div>

                  {isDeli && (
                    <>
                      <FormField
                        control={form.control}
                        name="refrigerationConfirmed"
                        render={({ field }) => (
                          <FormItem
                            id="field-refrigeration"
                            className={cn(
                              "flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4",
                              !field.value && "border-destructive bg-destructive/5"
                            )}
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className={cn(!field.value && "text-destructive")}>
                                Refrigeration confirmed
                              </FormLabel>
                              <FormDescription className="text-sm leading-relaxed mt-1">
                                Ask: Will sandwiches be refrigerated at the location until pickup? Do you have enough fridge space? Have you explained batching (only take out enough for 1 loaf at a time) and that assembled loaves go back in the fridge to cool before transport?
                              </FormDescription>
                              {!field.value && (
                                <p className="text-destructive text-sm font-bold mt-2 flex items-center">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  CRITICAL: Refrigeration must be confirmed for deli meat sandwiches
                                </p>
                              )}
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="refrigerationNotes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Refrigeration conversation notes</FormLabel>
                            <FormDescription>
                              What the contact said about their fridge, space, or handling plans
                            </FormDescription>
                            <FormControl>
                              <Textarea placeholder="e.g. They have a commercial fridge in the break room; coordinator will oversee batching..." {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="schedulingNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scheduling Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Scheduling-specific notes..." className="min-h-[100px]" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Transport, Staffing & Logistics */}
            <AccordionItem
              value="logistics"
              className="border rounded-lg bg-card px-4 shadow-sm"
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-lg">3. Driver/Speaker/Volunteer Logistics</span>
                  {!isPostSchedulingReady && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      Confirm before day-of
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-6 space-y-6">
                {/* Transport & Staffing Needs Assessment */}
                <div className="p-4 bg-muted/30 rounded-lg border border-border/50 space-y-5">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                    Transport & Staffing
                  </h4>

                  {/* 1. Transport Mode */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">How are sandwiches getting to the delivery location?</Label>
                    </div>
                    <RadioGroup
                      value={transportMode}
                      onValueChange={(val) => updateChecklist({ transport_mode: val })}
                      className="space-y-2 pl-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="tsp_driver" id="transport_tsp" />
                        <Label htmlFor="transport_tsp" className="text-sm cursor-pointer">TSP will arrange a driver (standard)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="self_transport" id="transport_self" />
                        <Label htmlFor="transport_self" className="text-sm cursor-pointer">Group is self-transporting</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="org_pickup" id="transport_org" />
                        <Label htmlFor="transport_org" className="text-sm cursor-pointer">Organization is sending their own driver to pick up</Label>
                      </div>
                    </RadioGroup>
                    {transportMode === 'tsp_driver' && (
                      <p className="text-xs text-muted-foreground pl-6 mt-1">
                        Assign driver in the main platform once confirmed.
                      </p>
                    )}
                    {(transportMode === 'self_transport' || transportMode === 'org_pickup') && (
                      <p className="text-xs text-muted-foreground pl-6 mt-1">
                        Transport checklist items (cooler with ice packs, etc.) apply to whoever is transporting.
                      </p>
                    )}
                    <div className="pl-6 mt-2">
                      <Textarea
                        placeholder="Transport notes: why this arrangement, any special logistics..."
                        value={(checklist as any).transport_notes || ''}
                        onChange={(e) => updateChecklist({ transport_notes: e.target.value })}
                        className="min-h-[50px] text-sm"
                      />
                    </div>
                  </div>

                  {/* 2. TSP Speaker/Rep */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Does this event need a TSP Speaker/Rep?</Label>
                    </div>
                    <div className="pl-6 space-y-2">
                      <div className="flex items-start space-x-2 space-y-0">
                        <Checkbox
                          id="needs_speaker"
                          checked={needsSpeaker}
                          onCheckedChange={(val) => updateChecklist({ needs_speaker: val === true })}
                          className="mt-0.5"
                        />
                        <Label htmlFor="needs_speaker" className="text-sm cursor-pointer">
                          Yes, a TSP speaker/rep is needed
                        </Label>
                      </div>
                      {suggestSpeaker && !needsSpeaker && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          500+ sandwiches — consider assigning a rep
                        </p>
                      )}
                      <Textarea
                        placeholder={needsSpeaker ? "Why a speaker is needed: group requested one, large event, etc." : "Why no speaker needed, or any notes about this decision..."}
                        value={speakerNotes}
                        onChange={(e) => updateChecklist({ speaker_notes: e.target.value })}
                        className="min-h-[50px] text-sm"
                      />
                    </div>
                  </div>

                  {/* 3. TSP Volunteers */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">How many TSP volunteers needed?</Label>
                    </div>
                    <div className="pl-6 space-y-2">
                      <Input
                        type="number"
                        min={0}
                        value={volunteerCountNeeded}
                        onChange={(e) => updateChecklist({ volunteer_count_needed: parseInt(e.target.value) || 0 })}
                        placeholder="0 = none needed"
                        className="w-[140px] font-mono"
                      />
                      <Textarea
                        placeholder="Why this number? What will volunteers do? Any special requirements..."
                        value={(checklist as any).volunteer_notes || ''}
                        onChange={(e) => updateChecklist({ volunteer_notes: e.target.value })}
                        className="min-h-[50px] text-sm"
                      />
                    </div>
                  </div>

                  {/* 4. Refrigerated Van */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ThermometerSnowflake className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Refrigerated van needed?</Label>
                    </div>
                    <div className="pl-6 space-y-2">
                      <div className="flex items-start space-x-2 space-y-0">
                        <Checkbox
                          id="needs_van"
                          checked={needsVan}
                          onCheckedChange={(val) => updateChecklist({ needs_van: val === true })}
                          className="mt-0.5"
                        />
                        <Label htmlFor="needs_van" className="text-sm cursor-pointer">
                          Yes, a refrigerated van is needed
                        </Label>
                      </div>
                      {suggestVan && !needsVan && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {sandwichCount >= 1000 ? '1000+ sandwiches' : 'Next-day pickup'} — consider a refrigerated van
                        </p>
                      )}
                      <Textarea
                        placeholder={needsVan ? "Why van is needed: volume, distance, next-day, etc." : "Why no van needed, or any transport temperature notes..."}
                        value={(checklist as any).van_notes || ''}
                        onChange={(e) => updateChecklist({ van_notes: e.target.value })}
                        className="min-h-[50px] text-sm"
                      />
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="deliveryInstructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instructions for Drivers, Speakers, Volunteers</FormLabel>
                      <FormDescription>
                        Collected from the contact at the organization to help our people get where they need to go on the day of the event. Share with anyone assigned to this event.
                      </FormDescription>
                      <FormControl>
                        <Textarea placeholder="Parking instructions, building entry, where to go on arrival, who to ask for..." {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="planningNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Planning Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="General planning notes..." className="min-h-[100px]" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Planning & Notes */}
            <AccordionItem value="planning" className="border rounded-lg bg-card px-4 shadow-sm">
              <AccordionTrigger className="hover:no-underline py-4">
                <span className="font-semibold text-lg">4. Planning & Notes</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-6 space-y-4">
                <FormField
                  control={form.control}
                  name="nextAction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Next Action</FormLabel>
                      <FormControl>
                        <Input placeholder="What needs to happen next?" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="internalNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Internal Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Private team notes..."
                          className="min-h-[150px]"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Section 5: Day-Of Checklist — only when Scheduled or Completed */}
            {(currentStatus === 'Scheduled' || currentStatus === 'Completed') && (
              <AccordionItem value="dayof" className="border rounded-lg bg-card px-4 shadow-sm">
                <AccordionTrigger className="hover:no-underline py-4">
                  <span className="font-semibold text-lg flex items-center gap-2">
                    5. Day-Of Checklist
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      dayOfCompleted === dayOfTotal
                        ? "bg-green-100 text-green-700"
                        : dayOfCompleted > 0
                          ? "bg-amber-100 text-amber-700"
                          : "bg-muted text-muted-foreground"
                    )}>
                      {dayOfCompleted}/{dayOfTotal} communicated
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-6 space-y-5">
                  <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                    Confirm these requirements have been communicated to the right people (volunteer group, driver, etc.).
                  </p>
                  {dayOfCompleted === dayOfTotal && (
                    <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg p-3">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      All day-of items communicated!
                    </div>
                  )}
                  {Object.entries(groupedDayOfItems).map(([group, items]) => (
                    <div key={group} className="space-y-1.5">
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {DAY_OF_GROUP_LABELS[group] || group}
                      </h5>
                      {items.map(item => {
                        const checked = checklistState[item.key];
                        const audienceLabel = item.audience ? AUDIENCE_LABELS[item.audience] : null;
                        return (
                          <label
                            key={item.key}
                            className={cn(
                              "flex items-start gap-2 py-1.5 px-3 rounded-md text-sm cursor-pointer transition-colors",
                              checked ? "text-muted-foreground bg-muted/20" : "hover:bg-muted/50"
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(val) => handleChecklistToggle(item.key, val === true)}
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
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Section 6: Post-Event Follow-Up */}
            <AccordionItem
              value="followup"
              className={cn(
                "border rounded-lg bg-card px-4 shadow-sm transition-opacity",
                currentStatus !== "Completed" && "opacity-70"
              )}
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-lg">6. Post-Event Follow-Up</span>
                  {currentStatus === "Completed" && (
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      postEventCompleted === postEventTotal
                        ? "bg-green-100 text-green-700"
                        : postEventCompleted > 0
                          ? "bg-amber-100 text-amber-700"
                          : "bg-muted text-muted-foreground"
                    )}>
                      {postEventCompleted}/{postEventTotal}
                    </span>
                  )}
                  {currentStatus !== "Completed" && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      Available after Completed
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-6 space-y-6">
                <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                  Call the group within 24 hours of the event. Record actual counts, gather feedback, and request photos.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="actualSandwichCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Actual Sandwiches Made</FormLabel>
                        <FormDescription className="text-xs">
                          How many sandwiches did the group actually make?
                        </FormDescription>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            {...field}
                            value={field.value ?? ''}
                            className="h-12 text-lg font-mono font-bold text-primary"
                          />
                        </FormControl>
                        {form.watch("sandwichCount") > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Originally planned: <span className="font-mono">{form.watch("sandwichCount")}</span>
                          </p>
                        )}
                      </FormItem>
                    )}
                  />
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-blue-600" />
                    <h4 className="font-medium text-blue-900 dark:text-blue-200 text-sm">Photos & Videos</h4>
                  </div>
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    Remind the contact to send photos and videos to <span className="font-medium">photos@thesandwichproject.org</span> — include names and Instagram handles for tagging.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="planningNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How Did It Go?</FormLabel>
                      <FormDescription>
                        Record feedback from the follow-up call — what went well, any issues, would they do it again?
                      </FormDescription>
                      <FormControl>
                        <Textarea placeholder="The group said..." className="min-h-[100px]" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Post-event checklist items */}
                <div className="p-4 bg-muted/30 rounded-lg border border-border/50 space-y-2">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider mb-3">Follow-Up Checklist</h4>
                  {POST_EVENT_CHECKLIST_ITEMS.map(item => {
                    const checked = checklistState[item.key];
                    const isDerived = !!item.derivedFrom;
                    const showAuto = item.showAutoTag === true && isDerived && checked;
                    return (
                      <label
                        key={item.key}
                        className={cn(
                          "flex items-start gap-2 py-1.5 px-3 rounded-md text-sm transition-colors",
                          showAuto
                            ? "bg-teal-50 text-teal-800"
                            : checked
                              ? "text-muted-foreground bg-muted/20"
                              : "hover:bg-muted/50 cursor-pointer"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={isDerived}
                          onCheckedChange={(val) => {
                            if (!isDerived) handleChecklistToggle(item.key, val === true);
                          }}
                          className="mt-0.5 shrink-0"
                        />
                        <span className={checked ? "line-through" : ""}>
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
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </form>
      </Form>

      <ContactLogDialog
        intake={intake}
        open={contactLogOpen}
        onOpenChange={setContactLogOpen}
      />
    </div>
  );
}
