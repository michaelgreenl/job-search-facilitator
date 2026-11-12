import { z } from 'zod'

export const progressMessageSchema = z.strictObject({
    message: z
        .enum([
            'Reviewing the supplied task details',
            'Loading applicant and resume evidence',
            'Verifying the role and employer details',
            'Reading role duties and requirements',
            'Checking required experience and skills',
            'Comparing the role with resume evidence',
            'Reviewing location and salary details',
            'Verifying the direct application route',
            'Checking whether the job is still open',
            'Capturing the complete job description',
            'Preparing the verified job-post result',
            'Reviewing applicant career experience',
            'Comparing available resume versions',
            'Checking the role against your profile',
            'Searching for relevant job openings',
            'Reviewing current job listings and fit',
            'Checking recent application updates',
            'Checking for replies to your outreach',
            'Finding contacts on the hiring team',
            'Reviewing hiring contacts and sources',
            'Checking contact details and relevance',
            'Drafting outreach for the selected role',
            'Preparing tailored application documents',
            'Reviewing verified resume experience',
            'Preparing the final recommendations',
        ])
        .check(z.maxLength(40)),
})
