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
import { AlertTriangle, Copy, Save, Phone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUpdateIntakeRecord } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";

const intakeSchema = z.object({
  organizationName: z.string().min(1, "Required"),
  contactName: z.string().min(1, "Required"),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  eventDate: z.string().optional(),
  eventTime: z.string().optional(),
  location: z.string().optional(),
  attendeeCount: z.coerce.number().min(0),
  sandwichCount: z.coerce.number().min(0),
  dietaryRestrictions: z.string().optional(),
  requiresRefrigeration: z.boolean(),
  hasIndoorSpace: z.boolean(),
  hasRefrigeration: z.boolean(),
  deliveryInstructions: z.string().optional(),
  status: z.string(),
  internalNotes: z.string().optional(),
});

type IntakeFormValues = z.infer<typeof intakeSchema>;

export function IntakeForm({ intake }: { intake: IntakeRecord }) {
  const updateMutation = useUpdateIntakeRecord();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<IntakeFormValues>({
    resolver: zodResolver(intakeSchema),
    defaultValues: {
      organizationName: intake.organizationName,
      contactName: intake.contactName,
      contactEmail: intake.contactEmail || "",
      contactPhone: intake.contactPhone || "",
      eventDate: intake.eventDate ? format(new Date(intake.eventDate), "yyyy-MM-dd") : "",
      eventTime: intake.eventTime || "",
      location: intake.location || "",
      attendeeCount: intake.attendeeCount,
      sandwichCount: intake.sandwichCount,
      dietaryRestrictions: intake.dietaryRestrictions || "",
      requiresRefrigeration: intake.requiresRefrigeration,
      hasIndoorSpace: intake.hasIndoorSpace,
      hasRefrigeration: intake.hasRefrigeration,
      deliveryInstructions: intake.deliveryInstructions || "",
      status: intake.status,
      internalNotes: intake.internalNotes || "",
    },
  });

  // Debounced autosave
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const subscription = form.watch((value) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const updates = {
          ...value,
          eventDate: value.eventDate ? new Date(value.eventDate).toISOString() : null,
        };
        
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
  const requiresFridge = form.watch("requiresRefrigeration");
  const hasFridge = form.watch("hasRefrigeration");
  const hasIndoor = form.watch("hasIndoorSpace");

  const showVolumeWarning = sandwichCount >= 400;
  const showFridgeWarning = requiresFridge && !hasFridge;
  const showIndoorWarning = !hasIndoor;

  const copySummary = () => {
    const v = form.getValues();
    const text = `
INTAKE SUMMARY
Org: ${v.organizationName}
Contact: ${v.contactName} (${v.contactEmail})
Event: ${v.eventDate} @ ${v.eventTime}
Loc: ${v.location}
Counts: ${v.attendeeCount} ppl / ${v.sandwichCount} sandwiches
Dietary: ${v.dietaryRestrictions || 'None'}
Risks: ${showVolumeWarning ? 'High Volume' : ''} ${showFridgeWarning ? 'No Fridge' : ''} ${showIndoorWarning ? 'Outdoor' : ''}
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
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger className="w-[180px] h-10 border-primary/20 bg-primary/5 font-medium text-primary">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Call Scheduled">Call Scheduled</SelectItem>
                  <SelectItem value="Call Complete">Call Complete</SelectItem>
                  <SelectItem value="Pre-Event Confirmed">Pre-Event Confirmed</SelectItem>
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
          <Button size="sm" className="flex-1 sm:flex-none bg-secondary hover:bg-secondary/90 text-secondary-foreground">
             <Phone className="h-4 w-4 mr-2" />
             Call Script
          </Button>
        </div>
      </div>

      <Form {...form}>
        <form className="space-y-6">
          <Accordion type="multiple" defaultValue={["contact", "event", "logistics"]} className="space-y-4">
            
            {/* Contact Information */}
            <AccordionItem value="contact" className="border rounded-lg bg-card px-4 shadow-sm">
              <AccordionTrigger className="hover:no-underline py-4">
                <span className="font-semibold text-lg flex items-center gap-2">
                  1. Contact Information
                  {!form.getValues("organizationName") && <Badge variant="outline" className="ml-2 text-xs">Pending</Badge>}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-6 space-y-4">
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
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Event Details */}
            <AccordionItem value="event" className="border rounded-lg bg-card px-4 shadow-sm">
              <AccordionTrigger className="hover:no-underline py-4">
                 <span className="font-semibold text-lg">2. Event Details</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="eventDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="eventTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Location Address</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Main St, City, State" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                  <h4 className="font-medium text-sm mb-3 text-muted-foreground uppercase tracking-wider">Quantities</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
              </AccordionContent>
            </AccordionItem>

            {/* Logistics & Risk */}
            <AccordionItem value="logistics" className="border rounded-lg bg-card px-4 shadow-sm">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-lg">3. Logistics & Risk Assessment</span>
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
                            Venue has dedicated indoor space?
                          </FormLabel>
                          <FormDescription>
                            Sandwiches cannot be left in direct sunlight or outdoors.
                          </FormDescription>
                          {!field.value && (
                             <p className="text-destructive text-sm font-medium mt-2 flex items-center">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Risk: No Indoor Space
                            </p>
                          )}
                        </div>
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <FormField
                      control={form.control}
                      name="requiresRefrigeration"
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
                              Requires Refrigeration?
                            </FormLabel>
                            <FormDescription>
                              Deli meats/cheese
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="hasRefrigeration"
                      render={({ field }) => (
                        <FormItem className={cn(
                          "flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4",
                          showFridgeWarning && "border-destructive bg-destructive/5"
                        )}>
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className={cn(showFridgeWarning && "text-destructive")}>
                              Venue has refrigeration?
                            </FormLabel>
                            <FormDescription>
                              Available for sandwich storage
                            </FormDescription>
                             {showFridgeWarning && (
                             <p className="text-destructive text-sm font-bold mt-2 flex items-center">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              CRITICAL: Fridge required but not available
                            </p>
                          )}
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="deliveryInstructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Instructions / Parking</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Loading dock location, parking info, etc." {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Internal Notes */}
            <AccordionItem value="internal" className="border rounded-lg bg-card px-4 shadow-sm">
              <AccordionTrigger className="hover:no-underline py-4">
                 <span className="font-semibold text-lg">Internal Notes</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-6">
                <FormField
                  control={form.control}
                  name="internalNotes"
                  render={({ field }) => (
                    <FormItem>
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
    </div>
  );
}
