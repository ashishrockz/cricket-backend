const Enterprise = require('../models/Enterprise');
const User = require('../models/User');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');
const { logAction } = require('../services/auditService');
const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: generate slug from name
// ─────────────────────────────────────────────────────────────────────────────
const generateSlug = (name) => {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60);
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create an enterprise (academy / club)
// @route   POST /api/v1/enterprises
// @access  Private (requires enterprise subscription)
// ─────────────────────────────────────────────────────────────────────────────
const createEnterprise = asyncHandler(async (req, res, next) => {
  // User must have enterprise plan
  if (req.user.subscriptionPlan !== 'enterprise') {
    return next(ApiError.forbidden(
      'Enterprise plan required to create an academy. Please upgrade your subscription.'
    ));
  }

  // Check if user already owns an enterprise
  const existing = await Enterprise.findOne({ owner: req.user._id });
  if (existing) {
    return next(ApiError.conflict('You already own an academy. You can only own one.'));
  }

  const { name, description, type, contact, address, settings } = req.body;

  let slug = generateSlug(name);
  // Ensure uniqueness
  let slugExists = await Enterprise.findOne({ slug });
  if (slugExists) slug = `${slug}-${Date.now().toString(36)}`;

  const enterprise = await Enterprise.create({
    name,
    slug,
    description,
    type: type || 'cricket_academy',
    owner: req.user._id,
    admins: [req.user._id],
    members: [{ user: req.user._id, role: 'owner', joinedAt: new Date() }],
    contact,
    address,
    settings: {
      maxMembers: 50,
      isPublic: true,
      allowMemberInvites: false,
      joinRequiresApproval: true,
      ...settings
    },
    stats: { totalMembers: 1 }
  });

  // Link enterprise to user
  await User.findByIdAndUpdate(req.user._id, {
    enterprise: enterprise._id,
    enterpriseRole: 'owner'
  });

  logger.info(`Enterprise created: ${enterprise.name} by ${req.user.email}`);

  ApiResponse.created(res, { enterprise }, 'Academy created successfully');
});

/**
 * @desc    Get all public enterprises / academy listing
 * @route   GET /api/v1/enterprises
 * @access  Public
 */
const listEnterprises = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search, type, city, isVerified } = req.query;

  const filter = { isActive: true, isSuspended: false, 'settings.isPublic': true };
  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ name: regex }, { description: regex }];
  }
  if (type) filter.type = type;
  if (city) filter['address.city'] = new RegExp(city, 'i');
  if (isVerified !== undefined) filter.isVerified = isVerified === 'true';

  const [enterprises, total] = await Promise.all([
    Enterprise.find(filter)
      .populate('owner', 'username fullName avatar')
      .select('-members -admins -settings.maxMembers')
      .sort({ isVerified: -1, createdAt: -1 })
      .skip(skip).limit(limit).lean(),
    Enterprise.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, enterprises, buildPaginationResponse(page, limit, total));
});

/**
 * @desc    Get enterprise details by slug or ID
 * @route   GET /api/v1/enterprises/:identifier
 * @access  Public
 */
const getEnterprise = asyncHandler(async (req, res, next) => {
  const { identifier } = req.params;
  const isObjectId = /^[a-f\d]{24}$/i.test(identifier);
  const query = isObjectId ? { _id: identifier } : { slug: identifier };

  const enterprise = await Enterprise.findOne({ ...query, isActive: true })
    .populate('owner', 'username fullName avatar city')
    .populate('admins', 'username fullName avatar')
    .populate('members.user', 'username fullName avatar playingRole');

  if (!enterprise) return next(ApiError.notFound('Academy not found'));

  // Only show full member list to members/admins
  const isAuthorized = req.user &&
    enterprise.members.some(m => m.user._id?.toString() === req.user._id?.toString());

  const response = enterprise.toObject();
  if (!isAuthorized) {
    response.members = response.members
      .filter(m => m.isActive && m.role !== 'support_staff')
      .map(m => ({ user: m.user, role: m.role }));
  }

  ApiResponse.success(res, { enterprise: response });
});

/**
 * @desc    Get my enterprise (owned or member of)
 * @route   GET /api/v1/enterprises/my
 * @access  Private
 */
const getMyEnterprise = asyncHandler(async (req, res, next) => {
  if (!req.user.enterprise) {
    return ApiResponse.success(res, { enterprise: null, message: 'You are not part of any academy' });
  }

  const enterprise = await Enterprise.findById(req.user.enterprise)
    .populate('owner', 'username fullName avatar')
    .populate('admins', 'username fullName avatar')
    .populate('members.user', 'username fullName avatar playingRole city')
    .populate('subscription', 'planSlug status endDate');

  if (!enterprise) return next(ApiError.notFound('Academy not found'));

  ApiResponse.success(res, { enterprise });
});

/**
 * @desc    Update enterprise details
 * @route   PUT /api/v1/enterprises/:id
 * @access  Private (owner or admin)
 */
const updateEnterprise = asyncHandler(async (req, res, next) => {
  const enterprise = await Enterprise.findById(req.params.id);
  if (!enterprise) return next(ApiError.notFound('Academy not found'));

  const isOwner = enterprise.owner.toString() === req.user._id.toString();
  const isAdmin = enterprise.admins.some(a => a.toString() === req.user._id.toString());
  const isSuperAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';

  if (!isOwner && !isAdmin && !isSuperAdmin) {
    return next(ApiError.forbidden('Only academy owners and admins can update academy details'));
  }

  const allowedFields = ['name', 'description', 'logo', 'banner', 'contact', 'address', 'settings', 'type'];
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) enterprise[field] = req.body[field];
  });

  await enterprise.save();

  logger.info(`Enterprise ${enterprise._id} updated by ${req.user.email}`);

  ApiResponse.success(res, { enterprise }, 'Academy updated successfully');
});

/**
 * @desc    Add a member to the enterprise
 * @route   POST /api/v1/enterprises/:id/members
 * @access  Private (owner or admin)
 */
const addMember = asyncHandler(async (req, res, next) => {
  const enterprise = await Enterprise.findById(req.params.id);
  if (!enterprise) return next(ApiError.notFound('Academy not found'));

  const isOwner = enterprise.owner.toString() === req.user._id.toString();
  const isAdmin = enterprise.admins.some(a => a.toString() === req.user._id.toString());
  if (!isOwner && !isAdmin) {
    return next(ApiError.forbidden('Only owners and admins can add members'));
  }

  const { userId, role = 'player' } = req.body;

  // Check max members limit
  const activeMemberCount = enterprise.members.filter(m => m.isActive).length;
  if (activeMemberCount >= enterprise.settings.maxMembers) {
    return next(ApiError.badRequest(
      `Academy has reached the maximum member limit (${enterprise.settings.maxMembers})`
    ));
  }

  const userToAdd = await User.findById(userId);
  if (!userToAdd) return next(ApiError.notFound('User not found'));

  // Check if already a member
  const existing = enterprise.members.find(m => m.user.toString() === userId);
  if (existing) {
    if (existing.isActive) return next(ApiError.conflict('User is already a member'));
    // Reactivate
    existing.isActive = true;
    existing.role = role;
  } else {
    enterprise.members.push({
      user: userId,
      role,
      joinedAt: new Date(),
      invitedBy: req.user._id,
      isActive: true
    });
  }

  enterprise.stats.totalMembers = enterprise.members.filter(m => m.isActive).length;
  await enterprise.save();

  // Link enterprise to user
  await User.findByIdAndUpdate(userId, {
    enterprise: enterprise._id,
    enterpriseRole: role
  });

  ApiResponse.success(res, null, 'Member added successfully');
});

/**
 * @desc    Remove a member from the enterprise
 * @route   DELETE /api/v1/enterprises/:id/members/:userId
 * @access  Private (owner or admin)
 */
const removeMember = asyncHandler(async (req, res, next) => {
  const enterprise = await Enterprise.findById(req.params.id);
  if (!enterprise) return next(ApiError.notFound('Academy not found'));

  const isOwner = enterprise.owner.toString() === req.user._id.toString();
  const isAdmin = enterprise.admins.some(a => a.toString() === req.user._id.toString());
  if (!isOwner && !isAdmin) {
    return next(ApiError.forbidden('Only owners and admins can remove members'));
  }

  const { userId } = req.params;

  if (userId === enterprise.owner.toString()) {
    return next(ApiError.badRequest('Cannot remove the academy owner'));
  }

  const memberIndex = enterprise.members.findIndex(m => m.user.toString() === userId);
  if (memberIndex === -1) return next(ApiError.notFound('Member not found'));

  enterprise.members[memberIndex].isActive = false;
  enterprise.stats.totalMembers = enterprise.members.filter(m => m.isActive).length;
  await enterprise.save();

  // Unlink enterprise from user
  await User.findByIdAndUpdate(userId, { enterprise: null, enterpriseRole: null });

  ApiResponse.success(res, null, 'Member removed successfully');
});

/**
 * @desc    Update a member's role
 * @route   PUT /api/v1/enterprises/:id/members/:userId/role
 * @access  Private (owner only)
 */
const updateMemberRole = asyncHandler(async (req, res, next) => {
  const enterprise = await Enterprise.findById(req.params.id);
  if (!enterprise) return next(ApiError.notFound('Academy not found'));

  if (enterprise.owner.toString() !== req.user._id.toString()) {
    return next(ApiError.forbidden('Only the academy owner can change member roles'));
  }

  const { userId } = req.params;
  const { role } = req.body;

  const member = enterprise.members.find(m => m.user.toString() === userId && m.isActive);
  if (!member) return next(ApiError.notFound('Active member not found'));

  member.role = role;

  // Update admins list
  if (role === 'admin') {
    if (!enterprise.admins.includes(userId)) {
      enterprise.admins.push(userId);
    }
  } else {
    enterprise.admins = enterprise.admins.filter(a => a.toString() !== userId);
  }

  await enterprise.save();
  await User.findByIdAndUpdate(userId, { enterpriseRole: role });

  ApiResponse.success(res, null, 'Member role updated');
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    List all enterprises (admin)
 * @route   GET /api/v1/admin/enterprises
 * @access  Admin
 */
const adminListEnterprises = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search, type, isVerified, isActive, isSuspended } = req.query;

  const filter = {};
  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ name: regex }, { slug: regex }];
  }
  if (type) filter.type = type;
  if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (isSuspended !== undefined) filter.isSuspended = isSuspended === 'true';

  const [enterprises, total] = await Promise.all([
    Enterprise.find(filter)
      .populate('owner', 'username email fullName')
      .populate('subscription', 'planSlug status endDate')
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit).lean(),
    Enterprise.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, enterprises, buildPaginationResponse(page, limit, total));
});

/**
 * @desc    Get full enterprise details (admin)
 * @route   GET /api/v1/admin/enterprises/:id
 * @access  Admin
 */
const adminGetEnterprise = asyncHandler(async (req, res, next) => {
  const enterprise = await Enterprise.findById(req.params.id)
    .populate('owner', 'username email fullName avatar subscriptionPlan')
    .populate('admins', 'username email fullName')
    .populate('members.user', 'username email fullName playingRole')
    .populate('subscription', 'planSlug status endDate billingCycle')
    .populate('verifiedBy', 'username email');

  if (!enterprise) return next(ApiError.notFound('Academy not found'));

  ApiResponse.success(res, { enterprise });
});

/**
 * @desc    Verify or unverify an enterprise (admin)
 * @route   PUT /api/v1/admin/enterprises/:id/verify
 * @access  Admin
 */
const verifyEnterprise = asyncHandler(async (req, res, next) => {
  const enterprise = await Enterprise.findById(req.params.id);
  if (!enterprise) return next(ApiError.notFound('Academy not found'));

  const { isVerified } = req.body;
  enterprise.isVerified = isVerified;
  enterprise.verifiedAt = isVerified ? new Date() : null;
  enterprise.verifiedBy = isVerified ? req.user._id : null;
  await enterprise.save();

  await logAction(req, {
    action: isVerified ? 'enterprise_verified' : 'enterprise_unverified',
    category: 'system',
    targetType: 'enterprise', targetId: enterprise._id, targetLabel: enterprise.name,
    description: `Academy "${enterprise.name}" ${isVerified ? 'verified' : 'unverified'} by admin`,
    severity: 'info'
  });

  ApiResponse.success(res, { enterprise }, `Academy ${isVerified ? 'verified' : 'unverified'}`);
});

/**
 * @desc    Suspend or unsuspend an enterprise (admin)
 * @route   PUT /api/v1/admin/enterprises/:id/suspend
 * @access  Admin
 */
const suspendEnterprise = asyncHandler(async (req, res, next) => {
  const enterprise = await Enterprise.findById(req.params.id);
  if (!enterprise) return next(ApiError.notFound('Academy not found'));

  const { isSuspended, reason } = req.body;
  enterprise.isSuspended = isSuspended;
  enterprise.suspensionReason = isSuspended ? (reason || 'Suspended by admin') : null;
  if (!isSuspended) enterprise.isActive = true;
  await enterprise.save();

  await logAction(req, {
    action: isSuspended ? 'enterprise_suspended' : 'enterprise_unsuspended',
    category: 'system',
    targetType: 'enterprise', targetId: enterprise._id, targetLabel: enterprise.name,
    description: `Academy "${enterprise.name}" ${isSuspended ? 'suspended' : 'unsuspended'}. Reason: ${reason || 'N/A'}`,
    severity: isSuspended ? 'critical' : 'warning'
  });

  ApiResponse.success(res, null, `Academy ${isSuspended ? 'suspended' : 'unsuspended'}`);
});

module.exports = {
  createEnterprise, listEnterprises, getEnterprise, getMyEnterprise,
  updateEnterprise, addMember, removeMember, updateMemberRole,
  adminListEnterprises, adminGetEnterprise, verifyEnterprise, suspendEnterprise
};
