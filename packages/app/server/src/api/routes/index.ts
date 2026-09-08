import express from 'express'
import { applicationArtifactRepository } from '../../db/repositories/application-artifact.repository.ts'
import { jobPostRepository } from '../../db/repositories/job-post.repository.ts'
import { jobUpdateCheckRepository } from '../../db/repositories/job-update-check.repository.ts'
import {
    outreachContactRepository,
    outreachRunRepository,
} from '../../db/repositories/outreach.repository.ts'
import { searchReportRepository } from '../../db/repositories/search-report.repository.ts'
import { createJobPostRouter } from './job-post.route.ts'
import { createJobUpdateCheckRouter } from './job-update-check.route.ts'
import { createOutreachContactRouter, createOutreachRunRouter } from './outreach.route.ts'
import { createSearchReportRouter } from './search-report.route.ts'
import { createSettingsRouter } from './settings.route.ts'
import { settingsRepository } from '../../settings/file-settings.repository.ts'

export const apiRouter = express.Router()

apiRouter.use('/settings', createSettingsRouter(settingsRepository))
apiRouter.use('/job-posts', createJobPostRouter(jobPostRepository, applicationArtifactRepository))
apiRouter.use(
    '/job-posts/:jobPostId/outreach-contacts',
    createOutreachContactRouter(outreachContactRepository),
)
apiRouter.use('/job-search-reports', createSearchReportRouter(searchReportRepository))
apiRouter.use('/outreach-runs', createOutreachRunRouter(outreachRunRepository))
apiRouter.use('/job-update-check', createJobUpdateCheckRouter(jobUpdateCheckRepository))
