import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./mock";
import type { CaptureSettings, DeploymentSpec, Experiment } from "@/types";

const LIVE = 3000; // poll interval: mirrors how often the agent reports

export const useClusters = () => useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
export const usePricing = () => useQuery({ queryKey: ["pricing"], queryFn: api.pricing, staleTime: Infinity });
export const useDeployments = () => useQuery({ queryKey: ["deployments"], queryFn: api.deployments, refetchInterval: LIVE });
export const useExperiments = () => useQuery({ queryKey: ["experiments"], queryFn: api.experiments });
export const useExperiment = (id: string) => useQuery({ queryKey: ["experiments", id], queryFn: () => api.experiment(id) });
export const useCapture = () => useQuery({ queryKey: ["capture"], queryFn: api.capture });
export const useTraces = () => useQuery({ queryKey: ["traces"], queryFn: api.traces });

function useInvalidate(...keys: string[]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useSaveDeployment() {
  const inv = useInvalidate("deployments");
  return useMutation({
    mutationFn: ({ id, spec }: { id?: string; spec: DeploymentSpec }) => (id ? api.updateDeployment(id, spec) : api.createDeployment(spec)),
    onSuccess: inv,
  });
}

export function useDeleteDeployment() {
  const inv = useInvalidate("deployments");
  return useMutation({ mutationFn: api.deleteDeployment, onSuccess: inv });
}

export function useCreateExperiment() {
  const inv = useInvalidate("experiments");
  return useMutation({ mutationFn: (e: Omit<Experiment, "id" | "status">) => api.createExperiment(e), onSuccess: inv });
}

export function useUpdateExperiment() {
  const inv = useInvalidate("experiments");
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateExperiment>[1] }) => api.updateExperiment(id, patch),
    onSuccess: inv,
  });
}

export function useUpdateCapture() {
  const inv = useInvalidate("capture", "traces");
  return useMutation({ mutationFn: (p: Partial<CaptureSettings>) => api.updateCapture(p), onSuccess: inv });
}

export function useTraceFeedback() {
  const inv = useInvalidate("traces");
  return useMutation({ mutationFn: ({ id, fb }: { id: string; fb: "up" | "down" }) => api.setTraceFeedback(id, fb), onSuccess: inv });
}
