/** @type {import('next').NextConfig} */
const nextConfig = {
  // Packages that must be require()'d at runtime instead of bundled into the
  // server output.
  //
  // `isomorphic-dompurify` is the load-bearing one: it pulls in jsdom, which
  // reads data files from its own package directory at import time (e.g.
  // browser/default-stylesheet.css). Bundled, those files aren't on disk where
  // jsdom looks, so importing it throws ENOENT — which took down every route
  // importing lib/sanitize-html (findings, text-records, CSV import) with an
  // empty 500 in production. Next already externalises `jsdom` itself by
  // default, but that doesn't cover it being reached *through*
  // isomorphic-dompurify, so it has to be named here.
  //
  // The other two are already in Next's built-in list; named explicitly so a
  // future change to that list can't silently start bundling the native ONNX
  // runtime the local embedding model depends on.
  serverExternalPackages: ['isomorphic-dompurify', '@huggingface/transformers', 'onnxruntime-node'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
