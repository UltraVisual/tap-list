const express = require('express');
const path = require('path');
const db = require('./db');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Helper: get settings as an object
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// Make settings available to all templates
app.use((req, res, next) => {
  res.locals.settings = getSettings();
  next();
});

// ---------- Public display ----------
app.get('/', (req, res) => {
  const beers = db
    .prepare(
      'SELECT * FROM beers WHERE is_active = 1 AND is_draft = 0 ORDER BY tap_number ASC'
    )
    .all();
  res.render('display', { beers });
});

// ---------- Admin & API ----------
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// ---------- Mobile pint tracker ----------
app.get('/pour', (req, res) => {
  const beers = db
    .prepare(
      'SELECT * FROM beers WHERE is_active = 1 AND is_draft = 0 ORDER BY tap_number ASC'
    )
    .all();
  res.render('pour', { beers });
});

app.listen(PORT, () => {
  console.log(`Tap List running at http://localhost:${PORT}`);
  console.log(`Admin panel:  http://localhost:${PORT}/admin`);
  console.log(`Pour tracker: http://localhost:${PORT}/pour`);
});
