/** @type {import('next').NextConfig} */
const nextConfig = {
  // Packages that must be require()'d at runtime instead of bundled into the
  // server output, because they load native binaries or read files from their
  // own package directory at runtime. Both are already in Next's built-in
  // list; named explicitly so a future change to that list can't silently
  // start bundling the native ONNX runtime the local embedding model depends
  // on.
  //
  // `isomorphic-dompurify` used to be listed here too, for the same reason via
  // jsdom — but externalising it was not enough to survive deployment, so
  // lib/sanitize-html.ts was moved to a DOM-free sanitizer instead. Don't
  // reintroduce a jsdom-backed dependency without re-solving that.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
