const { LOG_LEVEL = "ERROR" } = process.env;

const log = (...args) => {
  if (LOG_LEVEL === "DEBUG") {
    console.log(`🔥 ~ `, ...args);
  }
};

const warn = (...args) => {
  if (LOG_LEVEL === "DEBUG" || LOG_LEVEL === "WARNING") {
    console.log(`⚠️ ~ `, ...args);
  }
};

const error = (...args) => {
  if (LOG_LEVEL !== "NONE") {
    console.log(`🚀 ~ `, ...args);
  }
};

export default { log, warn, error };
