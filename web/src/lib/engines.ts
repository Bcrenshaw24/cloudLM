import type { EngineId } from "@/types";

// Each engine declares the args the deploy form renders. The agent maps these
// to container args for the engine's image.
export type EngineArg =
  | { key: string; label: string; type: "number"; default: number; min?: number; max?: number; step?: number; help?: string }
  | { key: string; label: string; type: "select"; default: string; options: string[]; help?: string }
  | { key: string; label: string; type: "boolean"; default: boolean; help?: string };

export interface EngineDef {
  id: EngineId;
  name: string;
  tagline: string;
  versions: string[];
  metrics: "native" | "partial"; // native = full Grafana perf dashboard
  gpu: boolean;
  args: EngineArg[];
}

const quant = ["none", "awq", "gptq", "fp8"];

export const ENGINES: EngineDef[] = [
  {
    id: "vllm",
    name: "vLLM",
    tagline: "PagedAttention, high-throughput serving",
    versions: ["0.11.0", "0.10.2", "0.9.2"],
    metrics: "native",
    gpu: true,
    args: [
      { key: "tensor_parallel_size", label: "Tensor parallel size", type: "number", default: 1, min: 1, max: 8 },
      { key: "max_model_len", label: "Max context length", type: "number", default: 8192, min: 512, step: 512 },
      { key: "gpu_memory_utilization", label: "GPU memory utilization", type: "number", default: 0.9, min: 0.5, max: 0.98, step: 0.01 },
      { key: "quantization", label: "Quantization", type: "select", default: "none", options: quant },
      { key: "enable_prefix_caching", label: "Prefix caching", type: "boolean", default: true },
    ],
  },
  {
    id: "sglang",
    name: "SGLang",
    tagline: "RadixAttention, fast structured generation",
    versions: ["0.5.3", "0.4.10"],
    metrics: "native",
    gpu: true,
    args: [
      { key: "tp", label: "Tensor parallel size", type: "number", default: 1, min: 1, max: 8 },
      { key: "context_length", label: "Max context length", type: "number", default: 8192, min: 512, step: 512 },
      { key: "mem_fraction_static", label: "Static memory fraction", type: "number", default: 0.88, min: 0.5, max: 0.95, step: 0.01 },
      { key: "quantization", label: "Quantization", type: "select", default: "none", options: quant },
    ],
  },
  {
    id: "tgi",
    name: "TGI",
    tagline: "Hugging Face Text Generation Inference",
    versions: ["3.3.4", "3.2.3"],
    metrics: "partial",
    gpu: true,
    args: [
      { key: "num_shard", label: "Shards", type: "number", default: 1, min: 1, max: 8 },
      { key: "max_total_tokens", label: "Max total tokens", type: "number", default: 8192, min: 512, step: 512 },
      { key: "quantize", label: "Quantization", type: "select", default: "none", options: ["none", "awq", "gptq", "bitsandbytes", "fp8"] },
    ],
  },
  {
    id: "trtllm",
    name: "TensorRT-LLM",
    tagline: "NVIDIA-optimized engines via Triton",
    versions: ["1.0.0", "0.21.0"],
    metrics: "partial",
    gpu: true,
    args: [
      { key: "tp_size", label: "Tensor parallel size", type: "number", default: 1, min: 1, max: 8 },
      { key: "max_batch_size", label: "Max batch size", type: "number", default: 64, min: 1, max: 512 },
      { key: "dtype", label: "Precision", type: "select", default: "fp16", options: ["fp16", "bf16", "fp8", "int4_awq"] },
    ],
  },
  {
    id: "ollama",
    name: "Ollama",
    tagline: "Simple local serving, GGUF models",
    versions: ["0.12.6", "0.11.10"],
    metrics: "partial",
    gpu: false,
    args: [
      { key: "num_ctx", label: "Context window", type: "number", default: 4096, min: 512, step: 512 },
      { key: "num_parallel", label: "Parallel requests", type: "number", default: 4, min: 1, max: 32 },
      { key: "keep_alive", label: "Keep model loaded", type: "boolean", default: true },
    ],
  },
  {
    id: "llamacpp",
    name: "llama.cpp",
    tagline: "Lightweight CPU/GPU inference server",
    versions: ["b6700", "b6500"],
    metrics: "partial",
    gpu: false,
    args: [
      { key: "ctx_size", label: "Context size", type: "number", default: 4096, min: 512, step: 512 },
      { key: "n_gpu_layers", label: "GPU layers", type: "number", default: 99, min: 0, max: 999 },
      { key: "parallel", label: "Parallel slots", type: "number", default: 4, min: 1, max: 32 },
    ],
  },
];

export const engineById = (id: EngineId) => ENGINES.find((e) => e.id === id)!;

export const defaultArgs = (id: EngineId) =>
  Object.fromEntries(engineById(id).args.map((a) => [a.key, a.default]));
