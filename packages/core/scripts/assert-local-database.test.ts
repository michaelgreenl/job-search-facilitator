import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const guardPath = fileURLToPath(new URL('./assert-local-database.ts', import.meta.url))

const guardExitStatus = (databaseUrl: string) =>
    spawnSync(process.execPath, [guardPath], {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'ignore',
    }).status

void test('allows resetting the default loopback database', () => {
    assert.equal(
        guardExitStatus(
            'postgresql://job_search:local_dev_password@localhost:5432/job_search_facilitator',
        ),
        0,
    )
})

void test('rejects resetting a remote database', () => {
    assert.notEqual(
        guardExitStatus(
            'postgresql://job_search:local_dev_password@database.example.com:5432/job_search_facilitator',
        ),
        0,
    )
})

void test('rejects resetting another loopback database', () => {
    assert.notEqual(
        guardExitStatus(
            'postgresql://job_search:local_dev_password@localhost:5432/job_search_facilitator_backup',
        ),
        0,
    )
})
