import type { JsonObject } from '@job-search-facilitator/core'
import { Ajv, type ValidateFunction } from 'ajv'

export type AgentOutputValidator = ValidateFunction<JsonObject>

export const isStructuredOutput = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const containsDialectMarker = (value: unknown): boolean =>
    Array.isArray(value)
        ? value.some(containsDialectMarker)
        : isStructuredOutput(value) &&
          ('$schema' in value || Object.values(value).some(containsDialectMarker))

const outputSchemaValidator = new Ajv({ addUsedSchema: false, strict: true })

export class InvalidAgentOutputSchemaError extends Error {
    constructor() {
        super('Invalid Agent output schema')
        this.name = 'InvalidAgentOutputSchemaError'
    }
}

export const compileOutputValidator = (schema: unknown): AgentOutputValidator => {
    if (
        !isStructuredOutput(schema) ||
        schema.type !== 'object' ||
        schema.$async === true ||
        containsDialectMarker(schema)
    ) {
        throw new InvalidAgentOutputSchemaError()
    }

    try {
        const validator = outputSchemaValidator.compile<JsonObject>(schema)

        if ('$async' in validator) {
            throw new InvalidAgentOutputSchemaError()
        }

        return validator
    } catch {
        throw new InvalidAgentOutputSchemaError()
    }
}
