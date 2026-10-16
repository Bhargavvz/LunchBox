/** Static export: the admin panel is plain files on S3 + CloudFront; all data comes from the API at runtime. */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  transpilePackages: ['@lunchbox/api-client'],
  poweredByHeader: false,
};

export default nextConfig;
