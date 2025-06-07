const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Check for required environment variables
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Error: GEMINI_API_KEY is not set in environment variables');
  console.error('Please create a .env file in the server directory with your Gemini API key:');
  console.error('GEMINI_API_KEY=your_api_key_here');
  process.exit(1);
}

// Error logging middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Middleware
app.use(cors({
  origin: 'http://localhost:3000', // Allow frontend requests
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Log all requests except health checks
app.use((req, res, next) => {
  if (req.url !== '/api/health') {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});

// Configure multer for file upload
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

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(apiKey);

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Extract subject and year from filename or request body
    const filename = req.file.originalname;
    const subject = req.body.subject || 'Unknown Subject';
    const year = req.body.year || new Date().getFullYear();

    // Return file info
    res.json({
      fileId: req.file.filename,
      subject: subject,
      year: year,
      originalName: filename
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Error uploading file' });
  }
});

// Analysis endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { fileId, subject, year } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    // Read the uploaded file
    const filePath = path.join(__dirname, 'uploads', fileId);
    const pdfBuffer = fs.readFileSync(filePath);
    
    // Parse the PDF
    const pdfData = await pdfParse(pdfBuffer);
    const fileContent = pdfData.text;

    // Prepare the paper data for analysis
    const paper = {
      text: fileContent,
      subject: subject,
      year: year
    };

    try {
      // Use the Gemini API to analyze the paper
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      // Format papers data for the prompt
      const papersText = `
Paper 1 (${paper.year}):
${paper.text}
`;

      // Prepare the prompt for analysis
      const prompt = `
You are an assistant that analyzes previous year questions. From the uploaded list of questions, provide a comprehensive analysis.

You must return the results in EXACTLY this format, including ALL sections and subsections:

1. Repeated Questions Analysis:
| Question | Repeated Count | Papers Appeared |
|----------|---------------|-----------------|
| What is software engineering? | 3 | Paper 1 (2020), Paper 2 (2021), Paper 3 (2022) |
| Explain the waterfall model. | 2 | Paper 1 (2020), Paper 3 (2022) |

2. Questions Asking for Differences:
| Question | Papers Appeared |
|----------|-----------------|
| Compare and contrast X and Y | Paper 1 (2020), Paper 3 (2022) |
| Differentiate between A and B | Paper 2 (2021) |

3. Questions Requiring Diagrams:
| Question | Papers Appeared |
|----------|-----------------|
| Draw and explain the architecture of... | Paper 1 (2020) |
| Illustrate the process flow of... | Paper 2 (2021), Paper 3 (2022) |

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

INPUT PAPERS:
${papersText}
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const analysis = response.text();

      res.json({
        analysis: analysis,
        timestamp: new Date().toISOString()
      });

    } catch (geminiError) {
      console.error('Gemini API Error:', geminiError);
      return res.status(500).json({ 
        error: 'Error analyzing with Gemini API. Please check your API key and try again.',
        details: geminiError.message 
      });
    }

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Error analyzing paper' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start the server with error handling
let server;
try {
  server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log('Press Ctrl+C to stop the server');
  });
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Please try a different port or kill the process using this port.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
}

// Handle process termination
const shutdown = () => {
  console.log('\nShutting down server...');
  if (server) {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  shutdown();
});
