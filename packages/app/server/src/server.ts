import { createServer } from 'node:http'
import closeWithGrace from 'close-with-grace'
import { app } from './app.ts'
import { env } from './config/env.ts'
import { prisma } from './db/prisma.ts'

const httpServer = createServer(app)

httpServer.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`)
})

closeWithGrace({ delay: 10_000 }, async ({ err, signal }) => {
  if (err) {
    console.error('Server shutting down after an error', err)
  } else {
    console.log(`${signal ?? 'Shutdown'} received, closing server`)
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
  await prisma.$disconnect()
})
