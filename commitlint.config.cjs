// commitlint.config.cjs
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'footer-max-line-length': [0, 'always'], // disable the footer length limit
    'scope-enum': [2, 'always', ['build', 'packages']],
    'scope-empty': [2, 'never']
  },
};