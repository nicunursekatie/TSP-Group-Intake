import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { IntakeRecord, Task } from "./types";

export function useIntakeRecords() {
  return useQuery({
    queryKey: ["intake-records"],
    queryFn: api.getIntakeRecords,
  });
}

export function useIntakeRecord(id: string | undefined) {
  return useQuery({
    queryKey: ["intake-records", id],
    queryFn: () => api.getIntakeRecord(id!),
    enabled: !!id,
  });
}

export function useCreateIntakeRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createIntakeRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intake-records"] });
    },
  });
}

export function useUpdateIntakeRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IntakeRecord> }) =>
      api.updateIntakeRecord(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["intake-records"] });
      queryClient.invalidateQueries({ queryKey: ["intake-records", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["tasks", variables.id] });
    },
  });
}

export function useDeleteIntakeRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteIntakeRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intake-records"] });
    },
  });
}

export function useTasks(intakeId: string | undefined) {
  return useQuery({
    queryKey: ["tasks", intakeId],
    queryFn: () => api.getTasksForIntake(intakeId!),
    enabled: !!intakeId,
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) =>
      api.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useSyncFromPlatform() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.syncFromPlatform,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intake-records"] });
    },
  });
}

export function useTspContacts(enabled: boolean) {
  return useQuery({
    queryKey: ["tsp-contacts"],
    queryFn: api.getTspContacts,
    enabled,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function usePushToPlatform() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.pushToPlatform(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intake-records"] });
    },
  });
}
