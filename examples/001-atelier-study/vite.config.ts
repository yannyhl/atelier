import { defineConfig } from 'vite';

export default defineConfig( {
	build: {
		target: 'es2022',
		assetsInlineLimit: 0,
		reportCompressedSize: false,
		// three core + GLTFLoader + meshopt decoder: about 850 KB raw, about 250 KB transferred.
		// The transfer budget is enforced by scripts/audit-perf.mjs, not by this warning.
		chunkSizeWarningLimit: 1000,
	},
} );
