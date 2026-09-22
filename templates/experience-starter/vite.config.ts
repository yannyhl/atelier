import { defineConfig } from 'vite';

export default defineConfig( {
	build: {
		target: 'es2022',
		assetsInlineLimit: 0,
		reportCompressedSize: false,
		// three.js core is about 160 KB brotli; it lives in the lazily imported experience chunk.
		chunkSizeWarningLimit: 800,
	},
} );
