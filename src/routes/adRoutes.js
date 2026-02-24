const router = require('express').Router();
const {
  getAdsForPlacement, recordClick
} = require('../controllers/adController');
const { optionalAuthenticate } = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Ads
 *   description: Ad delivery for the mobile application
 */

// Both routes are accessible without auth but enriched with user context if logged in
router.get('/placement/:placement', optionalAuthenticate, getAdsForPlacement);
router.post('/:id/click', optionalAuthenticate, recordClick);

module.exports = router;
