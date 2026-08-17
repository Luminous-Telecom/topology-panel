const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const PLUGIN_ID = require('../../src/plugin.json').id;

module.exports = (env) => {
  const isProd = env?.production ?? env?.production === true;

  return {
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? 'source-map' : 'eval-source-map',
    entry: {
      module: './src/module.ts',
    },
    output: {
      path: path.resolve(__dirname, '../../dist'),
      filename: '[name].js',
      // Chunks assíncronos: hash na query (convenção create-plugin). O entry module.js mantém nome
      // fixo — o Grafana busta o cache do browser com plugin.json info.version (?_cache=X.Y.Z).
      // Por isso deploy.sh incrementa o patch antes de cada build.
      chunkFilename: isProd ? '[name].js?_cache=[contenthash]' : '[name].js',
      publicPath: `public/plugins/${PLUGIN_ID}/`,
      // Evita colisão do runtime de chunk com outros plugins carregados no mesmo dashboard.
      uniqueName: PLUGIN_ID,
      library: {
        type: 'amd',
      },
      clean: true,
    },
    externals: [
      'lodash',
      'jquery',
      'moment',
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      '@emotion/css',
      '@grafana/data',
      '@grafana/runtime',
      '@grafana/ui',
      '@grafana/schema',
      function ({ request }, callback) {
        const prefix = 'grafana/';
        if (request && request.indexOf(prefix) === 0) {
          return callback(null, request.substring(prefix.length));
        }
        callback();
      },
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'swc-loader',
            options: {
              jsc: {
                parser: { syntax: 'typescript', tsx: true },
                transform: { react: { runtime: 'automatic' } },
              },
            },
          },
        },
        {
          test: /\.svg$/,
          type: 'asset/source',
        },
      ],
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: 'src/plugin.json', to: '.' },
          { from: 'src/img/plugin-icon.svg', to: 'img/plugin-icon.svg' },
        ],
      }),
    ],
  };
};
