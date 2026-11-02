// What is being sold and to whom. To change the demo's product, change only this file
// and the persona in api/realtime-session.js.

const activeScenario = {
  productName: 'banana',
  productWords: ['banana', 'snack', 'energy', 'potassium', 'fruit'],
  brief: `# The situation
This is a cold approach at a hackathon. The student walks up to Mara, a stranger, and tries to sell her a banana. There is no product sheet: the student sets the price.

# The customer
Mara is a hackathon participant who has worked at her laptop all day and has not eaten. She is hungry, tired, short on time, friendly but distracted, and careful with money. She does not mention her hunger unless asked. She will raise two objections: she is busy and does not see why she would buy from a stranger, and she could get something else to eat, like pizza.

# Facts about the product
A banana is a quick, easy, filling snack that needs no break from work. Everyday sales language about that, such as "it fills you up in a minute", is fine. Anything stronger, such as curing something, guaranteeing results or winning the hackathon, is an unsupported claim. The student sets the price: judge only whether it was said clearly, never whether it is high, low or fair.`,
};

module.exports = { activeScenario };
