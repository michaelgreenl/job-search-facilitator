import js from '@eslint/js'
import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from 'eslint-config-prettier/flat'
import pluginVue from 'eslint-plugin-vue'

export default defineConfigWithVueTs(
    globalIgnores(['**/dist/**', '**/node_modules/**', 'packages/core/src/generated/**']),
    js.configs.recommended,
    ...pluginVue.configs['flat/essential'],
    vueTsConfigs.recommended,
    {
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    },
    skipFormatting,
)
