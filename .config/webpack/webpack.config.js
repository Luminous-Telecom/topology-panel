const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const PLUGIN_ID = require('../../src/plugin.json').id;

module.exports = (env) => {
  const isProd = env?.production ?? env?.production === true;

  return {
    mode: isProd ? 'production' : 'development',
    // eval-source-map quebra no Grafana (CSP) e jsx-dev-runtime não existe no host.
    devtool: isProd ? 'source-map' : 'cheap-module-source-map',
    entry: {
      module: './src/module.ts',
    },
    output: {
      // Produção (`npm run build`) → dist/. Desenvolvimento (`npm run dev`) → pasta do plugin
      // no Grafana. O host não executa TypeScript de src/; o watch recompila a cada save.
      path: isProd
        ? path.resolve(__dirname, '../../dist')
        : process.env.GRAFANA_PLUGIN_DIR?.trim() || `/var/lib/grafana/plugins/${PLUGIN_ID}`,
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
      clean: {
        keep: (asset) => /(?:^|\/)(?:gpx_topology[^/]*|license\.json|MANIFEST\.txt)$/.test(asset),
      },
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
      extensions: ['.ts', '.tsx', '.js', '.scss'],
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
                // Grafana só expõe react/jsx-runtime — nunca jsx-dev-runtime.
                transform: { react: { runtime: 'automatic', development: false } },
              },
            },
          },
        },
        {
          test: /\.module\.scss$/,
          exclude: /node_modules/,
          use: [
            'style-loader',
            {
              loader: 'css-loader',
              options: {
                modules: {
                  localIdentName: 'luminous-topology__[local]__[hash:base64:6]',
                  namedExport: false,
                  exportLocalsConvention: 'as-is',
                },
              },
            },
            {
              loader: 'sass-loader',
              options: { api: 'modern-compiler' },
            },
          ],
        },
        {
          test: /\.scss$/,
          exclude: [/\.module\.scss$/, /node_modules/],
          use: [
            'style-loader',
            'css-loader',
            {
              loader: 'sass-loader',
              options: { api: 'modern-compiler' },
            },
          ],
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
          { from: 'LICENSE', to: '.' },
          { from: 'EULA.md', to: '.' },
        ],
      }),
    ],
  };
};
