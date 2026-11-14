// שרת מקומי / Render: ה-API + הקבצים הבנויים של האתר.
import express from 'express';
import { existsSync } from 'node:fs';
import app from './app.js';
import { ready } from './db.js';

const dist = new URL('../dist/', import.meta.url).pathname;
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(dist + 'index.html'));
}

const PORT = Number(process.env.PORT || 3000);
await ready();
app.listen(PORT, () => console.log(`🎶 Cantamos פועל על http://localhost:${PORT}`));
