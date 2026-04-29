const successResponse = (data) => {
  return {
    success: true,
    data: data || {},
    error: null,
  };
};

const errorResponse = (message, code) => {
  return {
    success: false,
    data: null,
    error: {
      message: message || "Error",
      code: code || "ERROR",
    },
  };
};

module.exports = {
  successResponse,
  errorResponse,
};
