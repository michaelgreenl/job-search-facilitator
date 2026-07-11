module.exports = {
  extends: [
    'stylelint-config-standard-scss',
    'stylelint-config-standard-vue/scss',
    'stylelint-config-prettier-scss',
    'stylelint-config-recess-order',
  ],
  rules: {
    'selector-max-type': null,
    'no-empty-source': null,
    'scss/at-rule-no-unknown': null,
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'scss/dollar-variable-pattern': null,
    'scss/percent-placeholder-pattern': null,
    'scss/at-mixin-pattern': null,
    'color-function-notation': 'modern',
    'alpha-value-notation': 'number',
    'selector-pseudo-class-no-unknown': [
      true,
      { ignorePseudoClasses: ['deep', 'global', 'slotted'] },
    ],
    'selector-pseudo-element-no-unknown': [
      true,
      { ignorePseudoElements: ['v-deep', 'v-global', 'v-slotted'] },
    ],
  },
}
