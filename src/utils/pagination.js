const { PAGINATION } = require('../config/constants');

const paginate = (query) => {
  let page = parseInt(query.page) || PAGINATION.DEFAULT_PAGE;
  let limit = parseInt(query.limit) || PAGINATION.DEFAULT_LIMIT;

  if (page < 1) page = 1;
  if (limit < 1) limit = PAGINATION.DEFAULT_LIMIT;
  if (limit > PAGINATION.MAX_LIMIT) limit = PAGINATION.MAX_LIMIT;

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const buildPaginationResponse = (page, limit, totalDocs) => {
  const totalPages = Math.ceil(totalDocs / limit);
  return {
    currentPage: page,
    totalPages,
    totalDocs,
    limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
};

module.exports = { paginate, buildPaginationResponse };
