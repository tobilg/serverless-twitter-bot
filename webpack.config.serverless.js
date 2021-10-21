const slsw = require( 'serverless-webpack' );
const path = require('path');

module.exports = {
  entry: slsw.lib.entries,
  externals: [ 'aws-sdk', 'dtrace-provider' ],
  target: 'node',
  mode: 'development', //slsw.lib.options.stage === 'dev' ? 'development' : 'production',
  module: {
    rules: [ {
      test: /\.js$/,
      exclude: /(node_modules)/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: [['@babel/preset-env', {
            "targets": {
              "node": "12.19"
            }
          }]],
          plugins: [
            '@babel/plugin-transform-runtime',
            '@babel/plugin-proposal-optional-chaining'
          ]
        }
      },
    },
   ],
  },
  plugins: [],
  output: {
    libraryTarget: 'commonjs',
    path: path.join( __dirname, '.webpack' ),
    filename: '[name].js',
  },
};
