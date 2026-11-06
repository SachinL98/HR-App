// Vercel Function entry: every request is handled by the compiled Nest app (see vercel.json).
module.exports = require('../dist/serverless').default;
