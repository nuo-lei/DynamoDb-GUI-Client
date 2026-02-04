export default {
  pluginOptions: {
    electronBuilder: {
      preload: 'src/preload.js',
      // Bundle all deps in main to simplify ESM runtime resolution
      chainWebpackMainProcess: (config) => {
        try {
          config.output.set('module', true);
          config.merge({ experiments: { outputModule: true } });
        } catch (e) { }
      },
    },
  },
};
