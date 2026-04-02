const express = require('express');
const db = require('../db');

const router = express.Router();

// ---------- Get all active (on-tap) beers ----------
router.get('/beers', async (req, res) => {
  const beers = await db.getOnTapBeers();
  res.json(beers);
});

// ---------- Pour a beer (reduce pints) ----------
router.post('/beers/:id/pour', async (req, res) => {
  const beer = await db.getBeerById(req.params.id);
  if (!beer) return res.status(404).json({ error: 'Beer not found' });

  const amount = parseFloat(req.body.amount) || 1;
  const newRemaining = Math.max(0, beer.pints_remaining - amount);

  await db.updateBeer(req.params.id, { pints_remaining: newRemaining });

  res.json({
    id: beer.id,
    name: beer.name,
    pints_remaining: newRemaining,
    pints_total: beer.pints_total,
  });
});

// ---------- Reset pints (new keg) ----------
router.post('/beers/:id/reset-pints', async (req, res) => {
  const beer = await db.getBeerById(req.params.id);
  if (!beer) return res.status(404).json({ error: 'Beer not found' });

  await db.updateBeer(req.params.id, { pints_remaining: beer.pints_total });

  const updated = await db.getBeerById(req.params.id);
  res.json(updated);
});

module.exports = router;
