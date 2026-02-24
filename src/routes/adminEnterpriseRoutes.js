const router = require('express').Router();
const {
  adminListEnterprises, adminGetEnterprise,
  verifyEnterprise, suspendEnterprise
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

module.exports = router;
