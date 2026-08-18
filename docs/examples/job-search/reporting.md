# Job Search Reporting and Sync

Use only validated artifacts from the current run. Do not rejudge results during delivery.

Assemble the API payload:

```bash
pnpm run job-search:artifact -- assemble CANDIDATES_PATH SELECTION_PATH COVERAGE_PATH PAYLOAD_PATH
```

Render the report:

```bash
pnpm run job-search:artifact -- render REPORT_DATE REPORT_ID PAYLOAD_PATH COVERAGE_PATH REPORT_PATH
```

Submit the unchanged payload:

```bash
curl --fail-with-body --silent --show-error --output PUT_RESPONSE_PATH \
  --request PUT --header 'Content-Type: application/json' --data-binary @PAYLOAD_PATH \
  'http://127.0.0.1:3000/api/job-search-reports/REPORT_DATE/REPORT_ID?requireNetNew=true'
```

Verify the response:

```bash
pnpm run job-search:artifact -- verify REPORT_DATE REPORT_ID PAYLOAD_PATH PUT_RESPONSE_PATH
```

Fetch and verify the stored report:

```bash
curl --fail-with-body --silent --show-error --output GET_RESPONSE_PATH \
  'http://127.0.0.1:3000/api/job-search-reports/REPORT_ID'
pnpm run job-search:artifact -- verify REPORT_DATE REPORT_ID PAYLOAD_PATH GET_RESPONSE_PATH
pnpm run job-search:artifact -- verify-storage REPORT_ID PAYLOAD_PATH
pnpm run job-search:artifact -- verify-markdown REPORT_DATE REPORT_ID PAYLOAD_PATH COVERAGE_PATH REPORT_PATH
```

Completion requires valid render, PUT, GET, storage, and Markdown checks.

Preserve current-run artifacts after a delivery failure. Never change a verdict to make delivery pass.
