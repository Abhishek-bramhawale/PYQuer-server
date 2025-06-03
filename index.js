const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI("AIzaSyATbmiQgv7EBKpV659p1H0tfejGE7iv-so"); 

async function main() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent("Explain how AI works in a few words");
    const response = await result.response;
    const text = await response.text();

    console.log("Response:", text);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
