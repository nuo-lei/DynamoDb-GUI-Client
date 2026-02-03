module.exports = {
  pluginOptions: {
    electronBuilder: {
      // Ensure preload is bundled and available at runtime
      preload: 'src/preload.js',
      // Keep certain heavy/Node-only deps external so runtime require works in asar
      externals: [
        '@aws-sdk/credential-providers',
        '@aws-sdk/shared-ini-file-loader',
        'aws-sdk',
      ],
      // Keep contextIsolation on and nodeIntegration off (set in BrowserWindow)
    },
  },
};
