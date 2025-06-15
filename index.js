const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mongoose = require('mongoose');
const cohere = require('cohere-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// mongoos Connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// mongodb connect
connectDB();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Error: GEMINI_API_KEY is not set in environment variables');
  console.error('Please create a .env file in the server directory with your Gemini API key:');
  console.error('GEMINI_API_KEY=your_api_key_here');
  process.exit(1);
}

// jwt
if (!process.env.JWT_SECRET) {
  console.error('Error: JWT_SECRET is not set in environment variables');
  console.error('Please add JWT_SECRET=your_jwt_secret_here to your .env file');
  process.exit(1);
}

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.use((req, res, next) => {
  if (req.url !== '/api/health') {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});


const authRoutes = require('./routes/auth');


app.use('/api/auth', authRoutes);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
console.log('Initializing Cohere with API key:', process.env.COHERE_API_KEY ? 'API key is set' : 'API key is missing');
cohere.init(process.env.COHERE_API_KEY);


const parsePapers = async (papers) => {
  const parsedPapers = [];
  for (const paper of papers) {
    const filePath = path.join(__dirname, 'uploads', paper.fileId);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(pdfBuffer);
    parsedPapers.push({
      text: pdfData.text,
      subject: paper.subject,
      year: paper.year
    });
  }
  return parsedPapers;
};

// not supported sentence sub..
const isMathSubject = (papers) => {
  return papers.some(paper => {
    const subject = paper.subject.toLowerCase();
    return subject.includes('math') || 
           subject.includes('mathematics') ||
           subject.includes('calculus') ||
           subject.includes('algebra') ||
           subject.includes('theory of computation') ||
           subject.includes('toc') ||
           subject.includes('discrete mathematics') ||
           subject.includes('dm') ||
           subject.includes('compiler design') ||
           subject.includes('compiler') ||
           subject.includes('automata') ||
           subject.includes('formal languages') ||
           subject.includes('cd');
  });
};

// prompt
const generatePrompt = (papersText, isMathSubject) => {
  return `
You are an assistant that analyzes previous year questions. From the uploaded list of questions, provide a comprehensive analysis.

${isMathSubject ? 'NOTE: This analysis tool works best for theory subjects. For mathematics, theory of computation, discrete mathematics, compiler design, and similar technical subjects, the analysis will be more general and focus on question patterns and types rather than exact content.' : ''}

You must return the results in EXACTLY this format, including ALL sections and subsections:

1. Repeated Questions Analysis:
If there are repeated questions, format them in a table like this:
| Question | Repeated Count | Papers Appeared |
|----------|---------------|-----------------|
| What is software engineering? | 3 | Paper 1, Paper 2, Paper 3 |
| Explain the waterfall model. | 2 | Paper 1, Paper 3 |

If there are NO repeated questions, simply state:
"No repeated questions found across the papers."

2. Questions Asking for Differences:
If there are questions asking for differences, format them in a table like this:
| Question | Papers Appeared |
|----------|-----------------|
| Compare and contrast X and Y | Paper 1, Paper 3 |
| Differentiate between A and B | Paper 2 |

If there are NO questions asking for differences, simply state:
"No questions asking for differences found in the papers."

3. Questions Requiring Diagrams:
If there are questions requiring diagrams, format them in a table like this:
| Question | Papers Appeared |
|----------|-----------------|
| Draw and explain the architecture of... | Paper 1 |
| Illustrate the process flow of... | Paper 2, Paper 3 |

If there are NO questions requiring diagrams, simply state:
"No questions requiring diagrams found in the papers."

4. Remaining Questions:
Paper 1:
a) [Question text]
b) [Question text]
c) [Question text]

5. Study Recommendations:
Based on the analysis of all papers, here are the key recommendations for students:

1. Important Topics:
   - Focus on frequently repeated topics
   - Pay attention to topics that appeared in recent papers

2. Question Patterns:
   - Practice answering difference-based questions
   - Be prepared for questions requiring diagrams
   - Note if there's a trend towards more application-based or theoretical questions

3. Preparation Strategy:
   - Prioritize studying topics identified as 'Important Topics'
   - Practice drawing diagrams for concepts listed in section 3
   - Work through remaining questions from Section 4

6. Predictions:
Based on the analysis of all papers, provide predictions for the upcoming year's paper. Include specific topics or question types that are highly likely to appear.

IMPORTANT:
- **For the 'Papers Appeared' column, you MUST ONLY include the paper number (e.g., 'Paper 1', 'Paper 2'). You are ABSOLUTELY FORBIDDEN from including any year information (e.g., 'Paper 1 (2020)', 'Paper 1 (Unknown Year)'). Focus solely on the paper number provided in the INPUT PAPERS.**
- Keep the exact format shown above for all sections.
- For sections 1, 2, and 3, if no matching questions are found, use the "No X found" message instead of an empty table.
- Do not add any extra sections or information before or after the specified sections.
- Do not modify the question text from the input papers.
- Use proper markdown table formatting only when there are actual items to display.
- For technical subjects (mathematics, theory of computation, discrete mathematics, compiler design, etc.), focus on question patterns and types rather than exact content when generating recommendations.
- Always start with Paper 1 in section 4.
- Add blank lines between questions within a paper in section 4.
- *Ensure section 5 is filled with actual, specific recommendations and not just the structure or placeholders.*
- *Ensure section 6 is filled with actual, specific predictions and not just the structure or placeholders.*

INPUT PAPERS:
${papersText}
`;
};

app.post('/api/upload', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFilesInfo = req.files.map(file => {
      const subject = 'Unknown Subject';
      const year = 'Unknown Year';

      return {
        fileId: file.filename,
        subject: subject,
        year: year,
        originalName: file.originalname
      };
    });

    res.json({ files: uploadedFilesInfo });
  } catch (error) {
    console.error('Upload error:', error);
    if (error instanceof multer.MulterError) {
      console.error('Multer specific error code:', error.code);
      return res.status(400).json({ error: `Upload failed: ${error.message}` });
    }
    res.status(500).json({ error: 'Error uploading files' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { papers, model = 'gemini' } = req.body;

    if (!papers || papers.length === 0) {
      return res.status(400).json({ error: 'No papers provided for analysis' });
    }

    const parsedPapers = await parsePapers(papers);
    if (parsedPapers.length === 0) {
      return res.status(400).json({ error: 'No valid papers found for analysis' });
    }

    const papersText = parsedPapers.map((paper, index) => `
Paper ${index + 1}:
${paper.text}
`).join('\n');

    const prompt = generatePrompt(papersText, isMathSubject(parsedPapers));

    let analysis;
    try {
      switch (model.toLowerCase()) {
        case 'gemini':
          const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
          const result = await geminiModel.generateContent(prompt);
          const response = await result.response;
          analysis = response.text();
          break;

        case 'mistral': {
          const { default: MistralClient } = await import('@mistralai/mistralai');
          const mistralClient = new MistralClient(process.env.MISTRAL_API_KEY);
          const mistralResponse = await mistralClient.chat({
            model: 'mistral-large-latest',
            messages: [{ role: 'user', content: prompt }]
          });
          analysis = mistralResponse.choices[0].message.content;
          break;
        }

        case 'cohere':
          const cohereResponse = await cohere.generate({
            model: 'command',
            prompt: prompt,
            max_tokens: 2000,
            temperature: 0.7,
            k: 0,
            stop_sequences: [],
            return_likelihoods: 'NONE'
          });
          analysis = cohereResponse.generations[0].text;
          break;

        default:
          return res.status(400).json({ error: 'Invalid model specified' });
      }

      console.log(`\n=== Raw ${model.toUpperCase()} Analysis Response ===\n`);
      console.log(analysis);
      console.log('\n===================================\n');

      res.json({
        analysis: analysis,
        model: model,
        timestamp: new Date().toISOString()
      });

    } catch (apiError) {
      console.error(`${model.toUpperCase()} API Error:`, apiError);
      return res.status(500).json({
        error: `Error analyzing with ${model.toUpperCase()} API. Please check your API key and try again.`,
        details: apiError.message
      });
    }

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Error analyzing paper' });
  }
});

// Gemini endpoint
app.post('/api/ai/gemini', async (req, res) => {
  try {
    const { papers } = req.body;
    if (!papers || papers.length === 0) {
      return res.status(400).json({ error: 'No papers provided for analysis' });
    }

    const parsedPapers = await parsePapers(papers);
    if (parsedPapers.length === 0) {
      return res.status(400).json({ error: 'No valid papers found for analysis' });
    }

    const papersText = parsedPapers.map((paper, index) => `
Paper ${index + 1}:
${paper.text}
`).join('\n');

    const prompt = generatePrompt(papersText, isMathSubject(parsedPapers));

    const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const analysis = response.text();

    res.json({
      analysis: analysis,
      model: 'gemini',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({
      error: 'Error analyzing with Gemini API. Please check your API key and try again.',
      details: error.message
    });
  }
});

// Mistral endpoint
app.post('/api/ai/mistral', async (req, res) => {
  try {
    const { papers } = req.body;
    if (!papers || papers.length === 0) {
      return res.status(400).json({ error: 'No papers provided for analysis' });
    }

    const parsedPapers = await parsePapers(papers);
    if (parsedPapers.length === 0) {
      return res.status(400).json({ error: 'No valid papers found for analysis' });
    }

    const papersText = parsedPapers.map((paper, index) => `
Paper ${index + 1}:
${paper.text}
`).join('\n');

    const prompt = generatePrompt(papersText, isMathSubject(parsedPapers));

    const { default: MistralClient } = await import('@mistralai/mistralai');
    const mistralClient = new MistralClient(process.env.MISTRAL_API_KEY);
    const mistralResponse = await mistralClient.chat({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: prompt }]
    });
    const analysis = mistralResponse.choices[0].message.content;

    res.json({
      analysis: analysis,
      model: 'mistral',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Mistral API Error:', error);
    res.status(500).json({
      error: 'Error analyzing with Mistral API. Please check your API key and try again.',
      details: error.message
    });
  }
});

// Cohere endpoint
app.post('/api/ai/cohere', async (req, res) => {
  try {
    const { papers } = req.body;
    if (!papers || papers.length === 0) {
      return res.status(400).json({ error: 'No papers provided for analysis' });
    }

    const parsedPapers = await parsePapers(papers);
    if (parsedPapers.length === 0) {
      return res.status(400).json({ error: 'No valid papers found for analysis' });
    }

    const papersText = parsedPapers.map((paper, index) => `
Paper ${index + 1}:
${paper.text}
`).join('\n');

    const prompt = generatePrompt(papersText, isMathSubject(parsedPapers));

    const cohereResponse = await cohere.generate({
      model: 'command',
      prompt: prompt,
      max_tokens: 2000,
      temperature: 0.7,
      k: 0,
      stop_sequences: [],
      return_likelihoods: 'NONE'
    });

   
    console.log('Cohere API Response:', JSON.stringify(cohereResponse, null, 2));

    if (!cohereResponse || !cohereResponse.generations || !cohereResponse.generations[0]) {
      throw new Error('Invalid response from Cohere API');
    }

    const analysis = cohereResponse.generations[0].text;

    res.json({
      analysis: analysis,
      model: 'cohere',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cohere API Error:', error);
    res.status(500).json({
      error: 'Error with Cohere API',
      details: error.message
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
