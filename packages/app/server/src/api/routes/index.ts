import express from 'express'
import { jobPostRepository } from '../../db/repositories/job-post.repository.ts'
import {
    outreachContactRepository,
    outreachRunRepository,
} from '../../db/repositories/outreach.repository.ts'
import { searchReportRepository } from '../../db/repositories/search-report.repository.ts'
import { trackRepository } from '../../db/repositories/track.repository.ts'
import { createJobPostRouter } from './job-post.route.ts'
import { createOutreachContactRouter, createOutreachRunRouter } from './outreach.route.ts'
import { createSearchReportRouter } from './search-report.route.ts'
import { createTrackingRouter } from './tracking.route.ts'

export const apiRouter = express.Router()

apiRouter.use('/job-posts', createJobPostRouter(jobPostRepository))
apiRouter.use(
    '/job-posts/:jobPostId/outreach-contacts',
    createOutreachContactRouter(outreachContactRepository),
)
apiRouter.use('/job-search-reports', createSearchReportRouter(searchReportRepository))
apiRouter.use('/outreach-runs', createOutreachRunRouter(outreachRunRepository))
apiRouter.use('/tracking', createTrackingRouter(trackRepository))
