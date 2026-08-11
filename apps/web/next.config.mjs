/** @type {import('next').NextConfig} */
export default {
  // The engine and db packages are workspace TypeScript source, not built artifacts.
  transpilePackages: ['@solum/engine', '@solum/db'],

  webpack: (config) => {
    /*
     * The engine imports siblings as './money.js' — correct ESM, which is why the same package runs
     * unchanged in vitest, a worker, and here. Webpack needs telling that a '.js' specifier may
     * resolve to a '.ts' file. Stripping the extensions instead would break Node's ESM resolution.
     */
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },

  // `pg` is a native-ish server dependency; keep it out of the bundle.
  serverExternalPackages: ['pg'],
};
