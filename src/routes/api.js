const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

// Hash of everything the display cares about EXCEPT pint counts
// (pints update in place on the client without a reload).
function computeTaplistVersion(beers, settings) {
  const bits = [
    settings.taproom_name || '',
    settings.theme || '',
    settings.logo_path || '',
    ...beers.map(b => [
      b.id, b.tap_number, b.name, b.image_path, b.description,
      b.abv, b.style, b.brewery, b.is_coming_soon, b.is_draft,
    ].join('|')),
  ];
  return crypto.createHash('md5').update(bits.join('\x1e')).digest('hex').slice(0, 16);
}

// ---------- Get all active (on-tap) beers ----------
router.get('/beers', async (req, res) => {
  const [beers, settings] = await Promise.all([db.getOnTapBeers(), db.getSettings()]);
  res.set('X-Taplist-Version', computeTaplistVersion(beers, settings));
  res.set('Access-Control-Expose-Headers', 'X-Taplist-Version');
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

// ---------- Client logs (batched) ----------
router.post('/logs', async (req, res) => {
  try {
    const entries = Array.isArray(req.body) ? req.body : (req.body && req.body.entries) || [];
    const ua = req.get('user-agent') || '';
    const stamped = entries.slice(0, 100).map(e => ({ ...e, user_agent: e.user_agent || ua }));
    const n = await db.writeLogs(stamped);
    res.json({ written: n });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
});

module.exports = router;
