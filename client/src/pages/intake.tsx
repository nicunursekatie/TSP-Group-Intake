import { useRoute, useLocation } from "wouter";
import { IntakeForm } from "@/components/intake-form";
import { WorkflowSidebar } from "@/components/workflow-sidebar";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useIntakeRecord, useTasks } from "@/lib/queries";

export default function IntakePage() {
  const [match, params] = useRoute("/intake/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const { data: record, isLoading } = useIntakeRecord(id);
  const { data: tasks = [], isLoading: tasksLoading } = useTasks(id);

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
         <div className="text-center">
            <h2 className="text-xl font-semibold">Record not found</h2>
            <Button variant="link" onClick={() => setLocation('/')}>Go Back</Button>
         </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] md:h-screen flex-col md:flex-row overflow-hidden">

      {/* Main Form Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 relative scroll-smooth">
        <div className="max-w-4xl mx-auto mb-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/')} className="mb-2 pl-0 hover:pl-2 transition-all">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold text-primary mb-1">
            {record.organizationName || "Untitled Intake"}
          </h1>
          <p className="text-sm text-muted-foreground">
             ID: <span className="font-mono text-xs">{record.id.slice(0, 8)}</span> • Created {new Date(record.createdAt).toLocaleDateString()}
          </p>
        </div>

        <IntakeForm key={record.id} intake={record} />
      </div>

      {/* Right Sidebar - Workflow */}
      <div className="hidden lg:block w-96 h-full border-l bg-sidebar/30">
        <WorkflowSidebar intake={record} tasks={tasks} tasksLoading={tasksLoading} />
      </div>
    </div>
  );
}
