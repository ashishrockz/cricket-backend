const router = require('express').Router();
const {
  listAds, getAd, createAd, updateAd,
  reviewAd, deleteAd, getAdAnalytics, toggleAdActive
} = require('../controllers/adController');

/**
 * @swagger
 * tags:
 *   name: Admin - Ads
 *   description: Admin management of advertisements
 */

router.get('/analytics', getAdAnalytics);
router.get('/', listAds);
router.post('/', createAd);
router.get('/:id', getAd);
router.put('/:id', updateAd);
router.put('/:id/review', reviewAd);
router.patch('/:id/toggle', toggleAdActive);
router.delete('/:id', deleteAd);

module.exports = router;
