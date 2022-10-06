module.exports = {
  presets: [['@babel/preset-env', { targets: { node: '14' } }], '@babel/preset-typescript'],
  env: {
    esm: {
      presets: [
        [
          '@babel/env',
          {
            modules: false,
            targets: { chrome: '100' },
          },
        ],
      ],
    },
  },
};
