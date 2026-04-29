const successResponse = (data) => {
  return {
    success: true,
    data,
    error: null,
  };
};

const errorResponse = (message, code) => {
  return {
    success: false,
    data: null,
    error: {
      message,
      code,
    },
  };
};

module.exports = {
  successResponse,
  errorResponse,
};
