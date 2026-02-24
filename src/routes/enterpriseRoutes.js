const router = require('express').Router();
const {
  createEnterprise, listEnterprises, getEnterprise, getMyEnterprise,
  updateEnterprise, addMember, removeMember, updateMemberRole
} = require('../controllers/enterpriseController');
const { authenticate, optionalAuthenticate } = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Enterprises
 *   description: Cricket academy and club management
 */

// Public
router.get('/', listEnterprises);
router.get('/:identifier', optionalAuthenticate, getEnterprise);

// Authenticated
router.use(authenticate);
router.get('/my/details', getMyEnterprise);
router.post('/', createEnterprise);
router.put('/:id', updateEnterprise);
router.post('/:id/members', addMember);
router.delete('/:id/members/:userId', removeMember);
router.put('/:id/members/:userId/role', updateMemberRole);

module.exports = router;
