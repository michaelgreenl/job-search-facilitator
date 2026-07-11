// https://on.cypress.io/api

describe('application shell', () => {
  it('visits the app root url', () => {
    cy.visit('/')
    cy.contains('h1', 'Job Search Facilitator')
  })
})
