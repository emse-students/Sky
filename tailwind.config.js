/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				accent: '#87CEFA',
				'accent-hover': '#69B4D8'
			},
			fontFamily: {
				orbitron: ['Orbitron', 'monospace'],
				space: ['Space Grotesk', 'sans-serif']
			}
		}
	},
	plugins: []
};
