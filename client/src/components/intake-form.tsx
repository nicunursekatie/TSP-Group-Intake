import { useEffect, useState, useCallback } from "react";
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
import { AlertTriangle, Copy, Save, Phone, Send, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUpdateIntakeRecord, usePushToPlatform } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { ContactLogDialog } from "./contact-log-dialog";

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
  pickupTimeWindow: z.string().optional(),
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
      pickupTimeWindow: intake.pickupTimeWindow || "",
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
  const sandwichType = form.watch("sandwichType");
  const requiresFridge = form.watch("requiresRefrigeration");
  const hasIndoor = form.watch("hasIndoorSpace");
  const refrigerationConfirmed = form.watch("refrigerationConfirmed");

  // Auto-set requiresRefrigeration based on sandwich type (deli meats need fridge)
  const isDeli = sandwichType === 'turkey' || sandwichType === 'ham' || sandwichType === 'chicken';
  useEffect(() => {
    if (isDeli && !requiresFridge) {
      form.setValue("requiresRefrigeration", true, { shouldDirty: true });
    } else if (!isDeli && sandwichType && requiresFridge) {
      form.setValue("requiresRefrigeration", false, { shouldDirty: true });
    }
  }, [sandwichType, isDeli, requiresFridge, form]);

  const showVolumeWarning = sandwichCount >= 400;
  const showFridgeWarning = requiresFridge && !refrigerationConfirmed;
  const showIndoorWarning = !hasIndoor;

  const copySummary = () => {
    const v = form.getValues();
    const text = `
INTAKE SUMMARY
Org: ${v.organizationName}
Contact: ${v.contactName} (${v.contactEmail})
Event: ${v.eventDate} @ ${v.eventTime}
Loc: ${v.location}
Counts: ${v.attendeeCount} ppl / ${v.sandwichCount} sandwiches (${v.sandwichType || 'type TBD'})
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
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="In Process">In Process</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
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
          {intake.externalEventId && intake.status !== 'Scheduled' && intake.status !== 'Completed' && (
            <Button
              size="sm"
              onClick={handleMarkScheduled}
              disabled={pushMutation.isPending}
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
                        <FormLabel>Pickup Window</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 2:00 - 3:00 PM" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                  <h4 className="font-medium text-sm mb-3 text-muted-foreground uppercase tracking-wider">Quantities & Type</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="attendeeCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Attendees</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} className="h-12 text-lg font-mono" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sandwichCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sandwiches Needed</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} className="h-12 text-lg font-mono font-bold text-primary" />
                          </FormControl>
                          {showVolumeWarning && (
                            <p className="text-destructive text-sm font-medium flex items-center mt-1">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Over 400: Requires TSP Rep
                            </p>
                          )}
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sandwichType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sandwich Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-12">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="turkey">Turkey</SelectItem>
                              <SelectItem value="ham">Ham</SelectItem>
                              <SelectItem value="chicken">Chicken (Deli)</SelectItem>
                              <SelectItem value="pbj">PBJ</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
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

            {/* Logistics & Food Safety */}
            <AccordionItem value="logistics" className="border rounded-lg bg-card px-4 shadow-sm">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-lg">3. Logistics & Food Safety</span>
                  {(showFridgeWarning || showIndoorWarning) && (
                    <Badge variant="destructive" className="ml-2">Risks Detected</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-6 space-y-6">
                
                <div className="space-y-4">
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
                          <FormLabel>
                            Event is taking place indoors?
                          </FormLabel>
                          <FormDescription>
                            Under no circumstances can sandwiches be made outdoors.
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
                    <FormField
                      control={form.control}
                      name="refrigerationConfirmed"
                      render={({ field }) => (
                        <FormItem className={cn(
                          "flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4",
                          !field.value && "border-destructive bg-destructive/5"
                        )}>
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className={cn(!field.value && "text-destructive")}>
                              Refrigeration Confirmed
                            </FormLabel>
                            <FormDescription className="text-sm leading-relaxed mt-1">
                              Have you confirmed with the contact that they have access to refrigeration on the day of the event, that it has enough space for the {sandwichCount || '___'} sandwiches they are making, and that the contact has been educated on the importance of: refrigeration of ingredients up until sandwich making, taking out ingredients in batches (only enough for each group to make 1 loaf at a time) to minimize ingredients being unrefrigerated, and that sandwich loaves must go back into the refrigerator once assembled to cool before going into coolers?
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
                  )}
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
