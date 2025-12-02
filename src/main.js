const viteEnv = import.meta?.env;

if (viteEnv?.DEV || viteEnv?.PROD) {
	import('../style.css');
}

import '../app.js';
