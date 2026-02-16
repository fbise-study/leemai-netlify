exports.handler = async function (event) {

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Only POST allowed"
    };
  }

  const { question, language } = JSON.parse(event.body || "{}");

  if (!question) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Question is required" })
    };
  }

  const prompt = `
You are LeemAI, a helpful study assistant for students.
Explain in a simple and clear way.
Answer in ${language === "ur" ? "Urdu" : "simple English"}.
Do NOT help with cheating.

Question:
${question}
`;

  const response = await fetch(
    "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 300,
          temperature: 0.7
        }
      })
    }
  );

  const data = await response.json();

  let answer = "No response from AI";

  if (Array.isArray(data) && data[0]?.generated_text) {
    answer = data[0].generated_text.replace(prompt, "").trim();
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ answer })
  };
};
