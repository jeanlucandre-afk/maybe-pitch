// The simulated panel that reviews what just happened on stage (the MAYBE "agent world").
// Edit per deck, then delete `template: true`. 5-8 named people with different stakes; `face` 0-4 picks a drawing in
// media/peeps/ (peep-student, -seller, -designer, -recruiter, -thinker). The crowd around them is anonymous dots with
// the roles below. Everything is SIMULATED and labelled as a synthetic estimate on the slide.
module.exports = {
  template: true,
  task: 'The presenter just did a live sales call with an AI retail buyer on stage. Judge how well they sold.',
  candidate: { name: 'The presenter', meta: 'Live call · 1 call reviewed' },
  clusters: { yes: 'Convinced', maybe: 'Needs more proof', no: 'Not convinced' },
  conclusion: {
    yes: { title: 'Would buy', small: 'SYNTHETIC ESTIMATE', list: 'Simulated market', added: 'convinced' },
    no: { title: 'Not yet', small: 'SYNTHETIC ESTIMATE', list: 'Simulated market', added: 'not convinced' },
  },
  agents: [
    { id: 'buyer', role: 'Store buyer', face: 1, cares: 'margin, shelf space, reliable supply' },
    { id: 'owner', role: 'Shop owner', face: 3, cares: 'whether customers ask for it, price' },
    { id: 'shopper', role: 'Regular shopper', face: 0, cares: 'is it good, is it worth it' },
    { id: 'rival', role: 'Rival brand', face: 2, cares: 'weak spots in the pitch' },
    { id: 'coach', role: 'Sales coach', face: 4, cares: 'discovery, objection handling, the close' },
    { id: 'skeptic', role: 'Skeptic', face: 3, cares: 'claims without proof' },
  ],
  crowdRoles: ['Shopper', 'Store buyer', 'Shop assistant', 'Area manager', 'Student', 'Parent', 'Café owner', 'Retiree', 'Tourist', 'Nurse'],
};
