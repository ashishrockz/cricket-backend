const router = require('express').Router();
const {
  adminListEnterprises, adminGetEnterprise,
  verifyEnterprise, suspendEnterprise,
  activateEnterprise, deactivateEnterprise
} = require('../controllers/enterpriseController');

/**
 * @swagger
 * tags:
 *   name: Admin - Enterprises
 *   description: Admin management of cricket academies
 */

router.get('/', adminListEnterprises);
router.get('/:id', adminGetEnterprise);
router.put('/:id/verify', verifyEnterprise);
router.put('/:id/suspend', suspendEnterprise);
router.post('/:id/activate', activateEnterprise);
router.post('/:id/deactivate', deactivateEnterprise);

module.exports = router;
