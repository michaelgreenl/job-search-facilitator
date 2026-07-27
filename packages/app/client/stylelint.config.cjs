module.exports = {
    extends: ['stylelint-config-standard-scss'],
    overrides: [
        { files: ['**/*.vue'], customSyntax: 'postcss-html' },
        {
            files: ['src/assets/styles/_variables.scss'],
            rules: { 'function-disallowed-list': null },
        },
    ],
    rules: {
        'function-disallowed-list': ['rgb', 'rgba'],
        'scss/at-mixin-pattern': null,
    },
}
