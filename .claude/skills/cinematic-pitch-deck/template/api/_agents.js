// The panel of simulated people who react live to what just happened on stage (the MAYBE "agent world").
// Edit per deck: who would really judge this moment? Keep 5-8, with different stakes. They are SIMULATED and
// the slide says so; their verdicts are a synthetic estimate, never presented as real people's opinions.
module.exports = {
  template: true, // delete this line once the panel is written for this deck (tools/check.mjs blocks it)
  task: 'The presenter just did a live sales call with an AI buyer on stage. Judge how well he sold.',
  verdictLabels: { yes: 'Would buy', maybe: 'Maybe', no: 'Would not buy' },
  agents: [
    { id: 'buyer', name: 'Retail buyer', cares: 'margin, shelf space, reliable supply' },
    { id: 'owner', name: 'Shop owner', cares: 'whether customers ask for it, price' },
    { id: 'shopper', name: 'Regular shopper', cares: 'is it good, is it worth it' },
    { id: 'rival', name: 'Rival seller', cares: 'weak spots in the pitch' },
    { id: 'coach', name: 'Sales coach', cares: 'discovery, objection handling, the close' },
    { id: 'skeptic', name: 'Skeptic', cares: 'claims without proof' },
  ],
};
