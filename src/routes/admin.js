const express = require('express');
const multer = require('multer');
const db = require('../db');
const { uploadFile } = require('../s3');

const router = express.Router();

// Use memory storage — files go straight to S3, never touch disk
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const ext = allowed.test(
      require('path').extname(file.originalname).toLowerCase()
    );
    const mime = allowed.test(file.mimetype);
    cb(null, ext || mime);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ---------- Admin dashboard ----------
router.get('/', async (req, res) => {
  const active = await db.getOnTapBeers();
  const drafts = await db.getDraftBeers();
  const beers = await db.getAllActiveBeers();
  res.render('admin/index', { beers, drafts, active });
});

// ---------- Add beer form ----------
router.get('/beers/new', (req, res) => {
  res.render('admin/beer-form', { beer: null });
});

// ---------- Edit beer form ----------
router.get('/beers/:id/edit', async (req, res) => {
  const beer = await db.getBeerById(req.params.id);
  if (!beer) return res.redirect('/admin');
  res.render('admin/beer-form', { beer });
});

// ---------- Create beer ----------
router.post('/beers', upload.single('image'), async (req, res) => {
  const { tap_number, name, description, abv, style, brewery, is_draft, is_coming_soon, pints_total, pints_remaining } = req.body;
  let image_path = '';
  if (req.file) {
    image_path = await uploadFile(req.file.buffer, req.file.originalname, 'beers');
  }
  const total = parseFloat(pints_total) || 38;
  const remaining = Math.min(parseFloat(pints_remaining) || total, total);

  await db.createBeer({
    tap_number: parseInt(tap_number) || 0,
    name: name || 'Untitled',
    description: description || '',
    abv: parseFloat(abv) || 0,
    style: style || '',
    brewery: brewery || '',
    image_path,
    is_draft: is_draft === 'on' || is_draft === '1' ? 1 : 0,
    is_coming_soon: is_coming_soon === 'on' || is_coming_soon === '1' ? 1 : 0,
    pints_remaining: remaining,
    pints_total: total,
  });

  res.redirect('/admin');
});

// ---------- Update beer ----------
router.post('/beers/:id', upload.single('image'), async (req, res) => {
  const beer = await db.getBeerById(req.params.id);
  if (!beer) return res.redirect('/admin');

  const { tap_number, name, description, abv, style, brewery, is_draft, is_coming_soon, pints_total, pints_remaining } = req.body;
  let image_path = beer.image_path;
  if (req.file) {
    image_path = await uploadFile(req.file.buffer, req.file.originalname, 'beers');
  }
  const total = parseFloat(pints_total) || beer.pints_total;
  const remaining = Math.min(Math.max(0, parseFloat(pints_remaining) || beer.pints_remaining), total);

  await db.updateBeer(req.params.id, {
    tap_number: parseInt(tap_number) || 0,
    name: name || 'Untitled',
    description: description || '',
    abv: parseFloat(abv) || 0,
    style: style || '',
    brewery: brewery || '',
    image_path,
    is_draft: is_draft === 'on' || is_draft === '1' ? 1 : 0,
    is_coming_soon: is_coming_soon === 'on' || is_coming_soon === '1' ? 1 : 0,
    pints_remaining: remaining,
    pints_total: total,
  });

  res.redirect('/admin');
});

// ---------- Delete beer (soft) ----------
router.post('/beers/:id/delete', async (req, res) => {
  await db.updateBeer(req.params.id, { is_active: 0 });
  res.redirect('/admin');
});

// ---------- Activate a draft (put it on tap) ----------
router.post('/beers/:id/activate', async (req, res) => {
  const beer = await db.getBeerById(req.params.id);
  if (!beer) return res.redirect('/admin');
  await db.updateBeer(req.params.id, {
    is_draft: 0,
    is_coming_soon: 0,
    pints_remaining: beer.pints_total,
  });
  res.redirect('/admin');
});

// ---------- Move to draft ----------
router.post('/beers/:id/to-draft', async (req, res) => {
  await db.updateBeer(req.params.id, { is_draft: 1 });
  res.redirect('/admin');
});

// ---------- Settings ----------
router.get('/settings', (req, res) => {
  res.render('admin/settings');
});

const VALID_THEMES = ['dark', 'light', 'chalkboard', 'copper', 'neon'];

router.post('/settings', upload.single('logo'), async (req, res) => {
  const { taproom_name, theme } = req.body;

  if (taproom_name !== undefined) {
    await db.putSetting('taproom_name', taproom_name);
  }

  if (theme && VALID_THEMES.includes(theme)) {
    await db.putSetting('theme', theme);
  }

  if (req.file) {
    const logoPath = await uploadFile(req.file.buffer, req.file.originalname, 'logo');
    await db.putSetting('logo_path', logoPath);
  }

  res.redirect('/admin/settings');
});

module.exports = router;
