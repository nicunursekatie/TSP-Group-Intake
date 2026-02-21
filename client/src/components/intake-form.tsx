import { useEffect, useState, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { IntakeRecord } from "@/lib/types";
import { format } from "date-fns";
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
import { AlertTriangle, Copy, Save, Phone, Send, Loader2, MessageSquare, Plus, X, CheckCircle2, Camera } from "lucide-react";
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
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger className="w-[180px] h-10 border-primary/20 bg-primary/5 font-medium text-primary">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="New" disabled={currentStatus !== "New"}>New</SelectItem>
                  <SelectItem value="In Process" disabled={currentStatus === "Scheduled" || currentStatus === "Completed"}>In Process</SelectItem>
                  <SelectItem
                    value="Scheduled"
                    disabled={currentStatus === "Completed"}
                  >
                    Scheduled
                  </SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {lastSaved && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 animate-in fade-in">
              <Save className="h-3 w-3" />
              Saved {format(lastSaved, "h:mm:ss a")}
            </span>
          )}
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={copySummary} className="flex-1 sm:flex-none">
            <Copy className="h-4 w-4 mr-2" />
            Copy Summary
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => setContactLogOpen(true)}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Log Contact
            {(intake.contactAttempts ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                {intake.contactAttempts}
              </Badge>
            )}
          </Button>
          {intake.status !== 'Completed' && (
            <>
              {(intake.status === 'New' || intake.status === 'In Process') && intake.externalEventId && (
                <Button
                  size="sm"
                  onClick={handleMarkScheduled}
                  disabled={pushMutation.isPending || updateMutation.isPending}
                  className="flex-1 sm:flex-none bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {pushMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Mark Scheduled
                </Button>
              )}
              {intake.status === 'Scheduled' && (
                <Button
                  size="sm"
                  onClick={handleMarkCompleted}
                  disabled={pushMutation.isPending || updateMutation.isPending}
                  className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
                >
                  {(pushMutation.isPending || updateMutation.isPending) ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Mark Completed
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Form {...form}>
        <form className="space-y-6">
          <Accordion type="multiple" defaultValue={["contact", "event", "logistics"]} className="space-y-4">
            
            {/* Contact Information */}
            <AccordionItem value="contact" className="border rounded-lg bg-card px-4 shadow-sm">
              <AccordionTrigger className="hover:no-underline py-4">
                <span className="font-semibold text-lg flex items-center gap-2">
                  1. Contact & Organization
                  {!form.getValues("organizationName") && <Badge variant="outline" className="ml-2 text-xs">Pending</Badge>}
                </span>
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
                      <FormItem>
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
                      <FormItem>
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
                      <FormItem>
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
                      <FormItem>
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
                      <FormItem className="md:col-span-2">
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

                  <div>
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
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
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

                  {isDeli && (
                    <>
                      <FormField
                        control={form.control}
                        name="refrigerationConfirmed"
                        render={({ field }) => (
                          <FormItem
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

            {/* Post-Scheduling Logistics — collect after event is confirmed */}
            <AccordionItem
              value="logistics"
              className={cn(
                "border rounded-lg bg-card px-4 shadow-sm transition-opacity",
                !isPostSchedulingReady && "opacity-70"
              )}
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-lg">3. Post-Scheduling Logistics</span>
                  {!isPostSchedulingReady && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      Available after Scheduled
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-6 space-y-6">
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

            {/* Section 5: Post-Event Follow-Up */}
            <AccordionItem
              value="followup"
              className={cn(
                "border rounded-lg bg-card px-4 shadow-sm transition-opacity",
                currentStatus !== "Completed" && "opacity-70"
              )}
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-lg">5. Post-Event Follow-Up</span>
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
