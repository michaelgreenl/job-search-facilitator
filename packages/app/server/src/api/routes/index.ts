import express from 'express'
import { jobPostRepository } from '../../db/repositories/job-post.repository.ts'
import { outreachContactRepository } from '../../db/repositories/outreach-contact.repository.ts'
import { outreachRunRepository } from '../../db/repositories/outreach-run.repository.ts'
import { searchReportRepository } from '../../db/repositories/search-report.repository.ts'
import { createJobPostRouter } from './job-post.route.ts'
import { createOutreachContactRouter } from './outreach-contact.route.ts'
import { createOutreachRunRouter } from './outreach-run.route.ts'
import { createSearchReportRouter } from './search-report.route.ts'

export const apiRouter = express.Router()

apiRouter.use('/job-posts', createJobPostRouter(jobPostRepository))
apiRouter.use(
    '/job-posts/:jobPostId/outreach-contacts',
    createOutreachContactRouter(outreachContactRepository),
)
apiRouter.use('/job-search-reports', createSearchReportRouter(searchReportRepository))
apiRouter.use('/outreach-runs', createOutreachRunRouter(outreachRunRepository))
