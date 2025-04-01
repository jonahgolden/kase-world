import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		allowedHosts: ['kase-world-6d61c97bfdb9.herokuapp.com', process.env.HOST || 'localhost'],
		port: Number(process.env.PORT) || 3000, // Default to 3000 if $PORT is not set
	},
	preview: {
		allowedHosts: ['kase-world-6d61c97bfdb9.herokuapp.com', process.env.HOST || 'localhost'],
		port: Number(process.env.PORT) || 3000, // Default to 3000 if $PORT is not set
	},
});
