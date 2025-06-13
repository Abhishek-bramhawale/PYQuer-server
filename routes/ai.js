  const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const router = express.Router();

const API_BASE_URL = 'http://localhost:5000';

export const API_ENDPOINTS = {
  GEMINI: `${API_BASE_URL}/api/ai/gemini`,
  MISTRAL: `${API_BASE_URL}/api/ai/mistral`,
  COHERE: `${API_BASE_URL}/api/ai/cohere`
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateAIResponse = async (model, prompt) => {
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('AI Response Error:', error);
    throw new Error('Failed to generate AI response');
  }
};

// Gemini endpoint
router.post('/gemini', async (req, res) => {
  try {
    const { analysis } = req.body;
    if (!analysis) {
      return res.status(400).json({ error: 'Analysis text is required' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Based on the following analysis, provide additional insights and recommendations:\n\n${analysis}`;
    
    const response = await generateAIResponse(model, prompt);
    res.json({ response });
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: 'Error generating Gemini response' });
  }
});

// Cohere endpoint
router.post('/cohere', async (req, res) => {
  try {
    const { analysis } = req.body;
    if (!analysis) {
      return res.status(400).json({ error: 'Analysis text is required' });
    }

    res.status(501).json({ error: 'Cohere API integration not implemented yet' });
  } catch (error) {
    console.error('Cohere API Error:', error);
    res.status(500).json({ error: 'Error generating Cohere response' });
  }
});

// Mistral endpoint
router.post('/mistral', async (req, res) => {
  try {
    const { analysis } = req.body;
    if (!analysis) {
      return res.status(400).json({ error: 'Analysis text is required' });
    }

    res.status(501).json({ error: 'Mistral API integration not implemented yet' });
  } catch (error) {
    console.error('Mistral API Error:', error);
    res.status(500).json({ error: 'Error generating Mistral response' });
  }
});

module.exports = router; 