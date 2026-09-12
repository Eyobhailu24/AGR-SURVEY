/** @type {import('next').NextConfig} */
const nextConfig = {
  // The local embedding model (lib/ai/embed.ts) runs on onnxruntime-node,
  // which loads native .node binaries and reads model files from disk at
  // runtime. Bundling it breaks both, so it has to stay external.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
