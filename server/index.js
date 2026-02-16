// Laminar is initialized in env.js (preloaded via --import)
// to ensure it runs before any imports resolve.

import app from './app.js';

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
