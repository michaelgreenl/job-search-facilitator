<template>
    <article
        id="target-dossier"
        class="job-detail glass-surface"
        aria-labelledby="job-detail-title"
        tabindex="-1"
    >
        <div class="detail-head">
            <div class="detail-case">
                <span class="case-rank" aria-label="Rank 1">01</span>
                <div>
                    <p class="eyebrow">Candid Health</p>
                    <h2 id="job-detail-title">Software Engineer</h2>
                    <p>San Francisco, New York City, or Denver</p>
                </div>
            </div>

            <div class="detail-status">
                <span class="pill pill--targeted">Targeted</span>
                <span>Run 2026-07-03</span>
            </div>
        </div>

        <dl class="detail-facts">
            <div>
                <dt>Compensation</dt>
                <dd>$135,000–$200,000</dd>
            </div>
            <div>
                <dt>Resume</dt>
                <dd>Backend / full-stack</dd>
            </div>
            <div>
                <dt>Action</dt>
                <dd>Prioritize</dd>
            </div>
            <div>
                <dt>Source</dt>
                <dd>YC Jobs → company careers → Ashby</dd>
            </div>
        </dl>

        <div class="evidence-ledger">
            <section class="text-block" aria-labelledby="fit-rationale-title">
                <span class="evidence-marker" aria-hidden="true">01</span>
                <div class="evidence-copy">
                    <h3 id="fit-rationale-title">Fit rationale</h3>
                    <p>
                        Best overall balance of stack fit, compensation, legitimacy, and
                        application-path quality. Product, backend, and dashboard overlap is strong.
                    </p>
                </div>
            </section>

            <section class="text-block" aria-labelledby="application-flow-title">
                <span class="evidence-marker" aria-hidden="true">02</span>
                <div class="evidence-copy">
                    <h3 id="application-flow-title">Application flow</h3>
                    <p>Company careers → Ashby board.</p>
                </div>
            </section>

            <section class="text-block" aria-labelledby="policy-title">
                <span class="evidence-marker" aria-hidden="true">03</span>
                <div class="evidence-copy">
                    <h3 id="policy-title">Policy / account requirements</h3>
                    <p>
                        No visible account wall before role discovery. Site-level terms and privacy
                        information are available.
                    </p>
                </div>
            </section>

            <section class="text-block" aria-labelledby="legitimacy-title">
                <span class="evidence-marker" aria-hidden="true">04</span>
                <div class="evidence-copy">
                    <h3 id="legitimacy-title">Legitimacy notes</h3>
                    <p>
                        Low fraud risk; the direct company careers page and public Ashby board
                        provide a clear source trail.
                    </p>
                </div>
            </section>
        </div>

        <div class="detail-actions">
            <label class="label-action">
                <span class="control-label">Review label</span>
                <span class="select-control">
                    <select>
                        <option selected>Unreviewed</option>
                        <option>P1</option>
                        <option>P2</option>
                        <option>Fast apply</option>
                        <option>Archive</option>
                    </select>
                </span>
                <small>Changes save immediately</small>
            </label>

            <div class="detail-action-buttons">
                <button class="button button--primary" type="button">Open job post</button>
                <button class="button button--secondary" type="button">Copy brief</button>
            </div>
        </div>
    </article>
</template>
