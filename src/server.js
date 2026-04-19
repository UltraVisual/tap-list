const express = require('express');
const path = require('path');
const db = require('./db');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
if (process.env.S3_LOCAL_DIR) {
  app.use('/uploads', express.static(path.join(process.env.S3_LOCAL_DIR, 'uploads')));
}

// Make settings available to all templates
app.use(async (req, res, next) => {
  res.locals.settings = await db.getSettings();
  next();
});

// ---------- Public display ----------
app.get('/', async (req, res) => {
  const beers = await db.getOnTapBeers();
  res.render('display', { beers });
});

// ---------- Admin & API ----------
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// ---------- Mobile pint tracker ----------
app.get('/pour', async (req, res) => {
  const beers = await db.getOnTapBeers();
  res.render('pour', { beers });
});

// Export app for Lambda handler
module.exports = app;

// Start server only when run directly (not imported by Lambda)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Tap List running at http://localhost:${PORT}`);
    console.log(`Admin panel:  http://localhost:${PORT}/admin`);
    console.log(`Pour tracker: http://localhost:${PORT}/pour`);
  });
}
