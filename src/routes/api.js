const express = require('express');
const db = require('../db');

const router = express.Router();

// ---------- Get all active (on-tap) beers ----------
router.get('/beers', (req, res) => {
  const beers = db
    .prepare(
      'SELECT * FROM beers WHERE is_active = 1 AND is_draft = 0 ORDER BY tap_number ASC'
    )
    .all();
  res.json(beers);
});

// ---------- Pour a beer (reduce pints) ----------
router.post('/beers/:id/pour', (req, res) => {
  const beer = db.prepare('SELECT * FROM beers WHERE id = ?').get(req.params.id);
  if (!beer) return res.status(404).json({ error: 'Beer not found' });

  const amount = parseFloat(req.body.amount) || 1;
  const newRemaining = Math.max(0, beer.pints_remaining - amount);

  db.prepare(
    'UPDATE beers SET pints_remaining = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(newRemaining, req.params.id);

  res.json({ id: beer.id, name: beer.name, pints_remaining: newRemaining, pints_total: beer.pints_total });
});

// ---------- Reset pints (new keg) ----------
router.post('/beers/:id/reset-pints', (req, res) => {
  db.prepare(
    'UPDATE beers SET pints_remaining = pints_total, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(req.params.id);

  const beer = db.prepare('SELECT * FROM beers WHERE id = ?').get(req.params.id);
  res.json(beer);
});

module.exports = router;
