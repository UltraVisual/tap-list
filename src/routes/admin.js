const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

const router = express.Router();

// ---------- Multer config for image uploads ----------
const beerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'beers');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `beer-${Date.now()}${ext}`);
  },
});

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo${ext}`);
  },
});

const uploadBeerImage = multer({
  storage: beerStorage,
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadLogo = multer({
  storage: logoStorage,
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    cb(null, ext);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ---------- Admin dashboard ----------
router.get('/', (req, res) => {
  const beers = db
    .prepare('SELECT * FROM beers WHERE is_active = 1 ORDER BY tap_number ASC')
    .all();
  const drafts = db
    .prepare('SELECT * FROM beers WHERE is_draft = 1 AND is_active = 1 ORDER BY updated_at DESC')
    .all();
  const active = db
    .prepare('SELECT * FROM beers WHERE is_draft = 0 AND is_active = 1 ORDER BY tap_number ASC')
    .all();
  res.render('admin/index', { beers, drafts, active });
});

// ---------- Add beer form ----------
router.get('/beers/new', (req, res) => {
  res.render('admin/beer-form', { beer: null });
});

// ---------- Edit beer form ----------
router.get('/beers/:id/edit', (req, res) => {
  const beer = db.prepare('SELECT * FROM beers WHERE id = ?').get(req.params.id);
  if (!beer) return res.redirect('/admin');
  res.render('admin/beer-form', { beer });
});

// ---------- Create beer ----------
router.post('/beers', uploadBeerImage.single('image'), (req, res) => {
  const { tap_number, name, description, abv, style, brewery, is_draft, pints_total } = req.body;
  const image_path = req.file ? `/uploads/beers/${req.file.filename}` : '';
  const total = parseFloat(pints_total) || 38;

  db.prepare(`
    INSERT INTO beers (tap_number, name, description, abv, style, brewery, image_path, is_draft, pints_remaining, pints_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseInt(tap_number) || 0,
    name || 'Untitled',
    description || '',
    parseFloat(abv) || 0,
    style || '',
    brewery || '',
    image_path,
    is_draft === 'on' || is_draft === '1' ? 1 : 0,
    total,
    total
  );

  res.redirect('/admin');
});

// ---------- Update beer ----------
router.post('/beers/:id', uploadBeerImage.single('image'), (req, res) => {
  const beer = db.prepare('SELECT * FROM beers WHERE id = ?').get(req.params.id);
  if (!beer) return res.redirect('/admin');

  const { tap_number, name, description, abv, style, brewery, is_draft, pints_total } = req.body;
  const image_path = req.file
    ? `/uploads/beers/${req.file.filename}`
    : beer.image_path;
  const total = parseFloat(pints_total) || beer.pints_total;

  // If total changed and new total is larger, adjust remaining proportionally
  let remaining = beer.pints_remaining;
  if (total !== beer.pints_total) {
    remaining = total; // reset to full when keg size changes
  }

  db.prepare(`
    UPDATE beers
    SET tap_number = ?, name = ?, description = ?, abv = ?, style = ?, brewery = ?,
        image_path = ?, is_draft = ?, pints_remaining = ?, pints_total = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    parseInt(tap_number) || 0,
    name || 'Untitled',
    description || '',
    parseFloat(abv) || 0,
    style || '',
    brewery || '',
    image_path,
    is_draft === 'on' || is_draft === '1' ? 1 : 0,
    remaining,
    total,
    req.params.id
  );

  res.redirect('/admin');
});

// ---------- Delete beer (soft) ----------
router.post('/beers/:id/delete', (req, res) => {
  db.prepare('UPDATE beers SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// ---------- Activate a draft (put it on tap) ----------
router.post('/beers/:id/activate', (req, res) => {
  const beer = db.prepare('SELECT * FROM beers WHERE id = ?').get(req.params.id);
  if (!beer) return res.redirect('/admin');

  db.prepare(`
    UPDATE beers SET is_draft = 0, pints_remaining = pints_total, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.params.id);

  res.redirect('/admin');
});

// ---------- Move to draft ----------
router.post('/beers/:id/to-draft', (req, res) => {
  db.prepare(`
    UPDATE beers SET is_draft = 1, updated_at = datetime('now') WHERE id = ?
  `).run(req.params.id);
  res.redirect('/admin');
});

// ---------- Settings ----------
router.get('/settings', (req, res) => {
  res.render('admin/settings');
});

router.post('/settings', uploadLogo.single('logo'), (req, res) => {
  const { taproom_name } = req.body;

  if (taproom_name !== undefined) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'taproom_name',
      taproom_name
    );
  }

  if (req.file) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'logo_path',
      `/uploads/${req.file.filename}`
    );
  }

  res.redirect('/admin/settings');
});

module.exports = router;
