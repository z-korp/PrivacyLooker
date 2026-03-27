const path = require('path');

const THREE_ROOT = path.resolve(__dirname, 'node_modules/three');
const THREE_JSM = path.join(THREE_ROOT, 'examples/jsm');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compile these ESM-only packages through Next.js webpack so imports resolve correctly
  transpilePackages: [
    'react-force-graph-3d',
    '3d-force-graph',
    'three-render-objects',
    'three-forcegraph',
    'kapsule',
    'd3-force-3d',
    'three-spritetext',
  ],

  // Acknowledge Turbopack (Next.js 16 default) — we use --webpack for build
  turbopack: {},

  webpack: (config) => {
    // Use `$` for exact-match alias — prevents prefix matching which would corrupt three/subpath imports
    config.resolve.alias['three$'] = path.join(THREE_ROOT, 'build/three.cjs');

    // Explicit subpath aliases for three.js add-ons that three-render-objects needs.
    // These resolve package.json export conditions that webpack 5 doesn't auto-follow.
    config.resolve.alias['three/webgpu'] = path.join(THREE_ROOT, 'build/three.webgpu.js');
    config.resolve.alias['three/tsl'] = path.join(THREE_ROOT, 'build/three.webgpu.js');
    config.resolve.alias['three/examples/jsm/controls/TrackballControls.js'] = path.join(
      THREE_JSM, 'controls/TrackballControls.js'
    );
    config.resolve.alias['three/examples/jsm/controls/OrbitControls.js'] = path.join(
      THREE_JSM, 'controls/OrbitControls.js'
    );
    config.resolve.alias['three/examples/jsm/controls/FlyControls.js'] = path.join(
      THREE_JSM, 'controls/FlyControls.js'
    );
    config.resolve.alias['three/examples/jsm/postprocessing/EffectComposer.js'] = path.join(
      THREE_JSM, 'postprocessing/EffectComposer.js'
    );
    config.resolve.alias['three/examples/jsm/postprocessing/RenderPass.js'] = path.join(
      THREE_JSM, 'postprocessing/RenderPass.js'
    );
    config.resolve.alias['three/examples/jsm/postprocessing/ShaderPass.js'] = path.join(
      THREE_JSM, 'postprocessing/ShaderPass.js'
    );
    config.resolve.alias['three/examples/jsm/postprocessing/UnrealBloomPass.js'] = path.join(
      THREE_JSM, 'postprocessing/UnrealBloomPass.js'
    );

    return config;
  },
};

module.exports = nextConfig;
