import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // onnxruntime-node uses native bindings — must not be bundled by webpack/Turbopack
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
