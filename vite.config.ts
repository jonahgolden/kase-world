import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		port: Number(process.env.PORT) || 3000, // Default to 3000 if $PORT is not set
	},
});
