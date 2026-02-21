import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useTasks, useUpdateTask } from "@/lib/queries";

export function TaskSidebar({ intakeId }: { intakeId: string }) {
  const { data: tasks = [], isLoading } = useTasks(intakeId);
  const updateTaskMutation = useUpdateTask();

  const handleToggle = (taskId: string, currentCompleted: boolean) => {
    updateTaskMutation.mutate({
      id: taskId,
      data: {
        completed: !currentCompleted,
        completedAt: !currentCompleted ? new Date().toISOString() : undefined,
      },
    });
  };

  // Sort: Overdue & Incomplete first, then by date
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.completed === b.completed) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    return a.completed ? 1 : -1;
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card className="h-full border-l-0 rounded-none bg-muted/10 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No tasks generated yet. Set an event date to generate the schedule.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="h-full flex flex-col bg-sidebar/50 border-l border-border">
      <div className="p-4 border-b bg-sidebar">
        <h3 className="font-semibold text-primary flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Task Checklist
        </h3>
        <p className="text-xs text-muted-foreground mt-1">Auto-generated workflow</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedTasks.map(task => {
          const isOverdue = !task.completed && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate));
          const isDueToday = !task.completed && isToday(new Date(task.dueDate));
          
          return (
            <div 
              key={task.id} 
              className={cn(
                "p-3 rounded-lg border text-sm transition-all",
                task.completed ? "bg-muted/50 border-transparent opacity-60" : "bg-card shadow-sm",
                isOverdue && !task.completed ? "border-destructive/50 bg-destructive/5" : ""
              )}
            >
              <div className="flex items-start gap-3">
                <Checkbox 
                  id={task.id} 
                  checked={task.completed} 
                  onCheckedChange={() => handleToggle(task.id, task.completed)}
                  className="mt-0.5"
                />
                <div className="space-y-1 w-full">
                  <label 
                    htmlFor={task.id}
                    className={cn(
                      "font-medium leading-none cursor-pointer block",
                      task.completed && "line-through text-muted-foreground",
                      isOverdue && "text-destructive"
                    )}
                  >
                    {task.title}
                  </label>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className={cn(
                        "flex items-center gap-1",
                        isOverdue && "text-destructive font-medium",
                        isDueToday && "text-orange-600 font-medium"
                    )}>
                      {isOverdue && <AlertCircle className="h-3 w-3" />}
                      {!isOverdue && <Clock className="h-3 w-3" />}
                      {format(new Date(task.dueDate), "MMM d")}
                    </span>
                    {task.completed && (
                        <span className="text-green-600 font-medium">Done</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
