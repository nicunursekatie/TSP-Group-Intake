import { useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, Mail, MessageSquare, Clock, Loader2 } from "lucide-react";
import type { IntakeRecord, ContactAttempt } from "@/lib/types";
import { useUpdateIntakeRecord } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const METHOD_OPTIONS = [
  { value: 'call', label: 'Phone Call', icon: Phone },
  { value: 'text', label: 'Text Message', icon: MessageSquare },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'combination', label: 'Multiple Methods', icon: Phone },
] as const;

const OUTCOME_OPTIONS = [
  { value: 'talked_to_them', label: 'Talked to them' },
  { value: 'left_voicemail', label: 'Left a voicemail' },
  { value: 'sent_text', label: 'Sent text with contact info' },
  { value: 'sent_email_toolkit', label: 'Sent email with toolkit' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'other', label: 'Other' },
] as const;

interface ContactLogDialogProps {
  intake: IntakeRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactLogDialog({ intake, open, onOpenChange }: ContactLogDialogProps) {
  const [method, setMethod] = useState<string>("");
  const [outcome, setOutcome] = useState<string>("");
  const [notes, setNotes] = useState("");
  const updateMutation = useUpdateIntakeRecord();
  const queryClient = useQueryClient();

  const existingLog: ContactAttempt[] = Array.isArray(intake.contactAttemptsLog)
    ? intake.contactAttemptsLog
    : [];

  const handleSave = () => {
    if (!method || !outcome) {
      toast.error("Please select a method and outcome");
      return;
    }

    const newEntry: ContactAttempt = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      method: method as ContactAttempt['method'],
      outcome: outcome as ContactAttempt['outcome'],
      notes: notes.trim(),
    };

    const updatedLog = [...existingLog, newEntry];
    const data: Record<string, any> = {
      contactAttemptsLog: updatedLog,
      contactAttempts: updatedLog.length,
    };

    // Auto-transition: first contact attempt on a New record → In Process
    if (intake.status === 'New' && existingLog.length === 0) {
      data.status = 'In Process';
    }

    updateMutation.mutate(
      { id: intake.id, data },
      {
        onSuccess: () => {
          toast.success("Contact attempt logged");
          queryClient.invalidateQueries({ queryKey: ["intake-records", intake.id] });
          setMethod("");
          setOutcome("");
          setNotes("");
          onOpenChange(false);
        },
        onError: () => {
          toast.error("Failed to log contact attempt");
        },
      }
    );
  };

  const getMethodIcon = (m: string) => {
    switch (m) {
      case 'call': return <Phone className="h-3 w-3" />;
      case 'text': return <MessageSquare className="h-3 w-3" />;
      case 'email': return <Mail className="h-3 w-3" />;
      default: return <Phone className="h-3 w-3" />;
    }
  };

  const getOutcomeLabel = (o: string) => {
    return OUTCOME_OPTIONS.find(opt => opt.value === o)?.label || o;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log Contact Attempt</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {intake.preferredContactMethod && (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded-md text-sm">
              Requester preferred: <span className="font-medium capitalize">{intake.preferredContactMethod}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue placeholder="How did you reach out?" />
              </SelectTrigger>
              <SelectContent>
                {METHOD_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger>
                <SelectValue placeholder="What happened?" />
              </SelectTrigger>
              <SelectContent>
                {OUTCOME_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              placeholder="Any details about this contact attempt..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Contact History */}
          {existingLog.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Previous Attempts ({existingLog.length})
              </h4>
              <ScrollArea className="max-h-40">
                <div className="space-y-2">
                  {[...existingLog].reverse().map((attempt) => (
                    <div key={attempt.id} className="flex gap-2 text-sm border-l-2 border-muted pl-3 py-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {getMethodIcon(attempt.method)}
                          <span className="font-medium capitalize">{attempt.method}</span>
                          <span className="text-muted-foreground">—</span>
                          <span>{getOutcomeLabel(attempt.outcome)}</span>
                        </div>
                        {attempt.notes && (
                          <p className="text-muted-foreground mt-0.5">{attempt.notes}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(attempt.timestamp), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              "Log Attempt"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
