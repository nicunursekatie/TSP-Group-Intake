import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { IntakeForm } from "@/components/intake-form";
import { TaskSidebar } from "@/components/task-sidebar";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function IntakePage() {
  const [match, params] = useRoute("/intake/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const intakeRecords = useStore(state => state.intakeRecords);
  const addIntake = useStore(state => state.addIntake);
  
  // Logic to handle "New" vs "Edit"
  // Since we have a dedicated /new route logic in the dashboard, 
  // let's handle the creation redirection if we are at /new route or ensure we find the record
  
  // Actually, let's create a wrapper that handles "new" creation separately or we can just create it on mount if ID is "new"
  // But standard pattern is: Click "New" -> Creates Record -> Redirects to /intake/UUID
  
  const record = intakeRecords.find(r => r.id === id);

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
        
        <IntakeForm intake={record} />
      </div>

      {/* Right Sidebar - Tasks */}
      <div className="hidden lg:block w-80 h-full border-l bg-sidebar/30">
        <TaskSidebar intakeId={record.id} />
      </div>
    </div>
  );
}
