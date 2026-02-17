// FIXED Netlify Function with CORS headers
exports.handler = async function (event) {
  
  // CORS headers - REQUIRED for browser requests
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Only POST allowed" })
    };
  }

  try {
    const { question, language } = JSON.parse(event.body || "{}");

    if (!question) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Question is required" })
      };
    }

    const prompt = `
You are LeemAI, a helpful study assistant for FBISE students in Pakistan.
Explain concepts in a simple and clear way suitable for high school students.
Answer in ${language === "ur" ? "Urdu" : "simple English"}.
Do NOT help with cheating or provide exam answers.

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
            temperature: 0.7,
            return_full_text: false
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Hugging Face API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('HF Response:', data);

    let answer = "No response from AI";

    if (Array.isArray(data) && data[0]?.generated_text) {
      answer = data[0].generated_text.replace(prompt, "").trim();
    } else if (data.generated_text) {
      answer = data.generated_text.replace(prompt, "").trim();
    }

    // Return success with CORS headers
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ answer })
    };

  } catch (error) {
    console.error('Function error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Internal server error",
        message: error.message 
      })
    };
  }
};
