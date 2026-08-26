// commitlint.config.cjs
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'footer-max-line-length': [0, 'always'], // disable the footer length limit
    'scope-enum': [0, 'always'], // allow arbitrary scope strings
    'scope-empty': [2, 'never']
  },
};